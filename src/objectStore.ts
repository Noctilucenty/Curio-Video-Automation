/**
 * Object storage for rendered artifacts.
 *
 * Why this exists: on Render the container filesystem is ephemeral. A render row that
 * says "completed" while output_uri points at /videos/x.mp4 on a container that has
 * since been replaced is a lie — the row survives the deploy, the file does not. The
 * artifact has to outlive the process that produced it, so the worker uploads FIRST
 * and only then marks the job completed. Completion therefore always implies a
 * fetchable artifact, never merely a finished ffmpeg run.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHmac } from "node:crypto";

export interface PutResult {
  uri: string;        // durable, fetchable location recorded in render_jobs.output_uri
  bytes: number;
  sha256: string;
}

export interface ObjectStore {
  /** Upload `filePath` under `key`. Must be idempotent: same key + same bytes = same result. */
  put(key: string, filePath: string, contentType?: string): Promise<PutResult>;
  /** True if this key already holds an artifact — lets a resumed worker skip re-uploading. */
  has(key: string): Promise<boolean>;
  readonly kind: "local" | "s3";
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

// ---------------------------------------------------------------------------
// LocalObjectStore — development and tests
// ---------------------------------------------------------------------------
/**
 * Backed by the data directory. Honest about what it is: this is NOT durable across
 * Render deploys, which is why makeObjectStore refuses it in production.
 */
export class LocalObjectStore implements ObjectStore {
  readonly kind = "local" as const;
  constructor(private root: string, private publicPrefix = "/videos") {}

  private pathFor(key: string): string {
    // Path-injection guard. Reject rather than sanitize: silently rewriting "../x" to
    // "x" would collapse two distinct keys onto one object, corrupting artifacts as
    // surely as a traversal would leak them.
    const norm = key.replace(/\\/g, "/");
    if (norm.split("/").some((seg) => seg === "..")) throw new Error("objectStore: key escapes root");
    const safe = norm.split("/").filter((s) => s && s !== ".").join("/");
    if (!safe) throw new Error("objectStore: empty key");
    const full = resolve(join(this.root, safe));
    if (full !== resolve(this.root) && !full.startsWith(resolve(this.root) + "/")) {
      throw new Error("objectStore: key escapes root");
    }
    return full;
  }

  async put(key: string, filePath: string): Promise<PutResult> {
    const dest = this.pathFor(key);
    await mkdir(dirname(dest), { recursive: true });
    if (resolve(filePath) !== dest) await copyFile(filePath, dest);
    const [bytes, sha] = await Promise.all([stat(dest).then((s) => s.size), sha256File(dest)]);
    return { uri: `${this.publicPrefix}/${key}`, bytes, sha256: sha };
  }

  async has(key: string): Promise<boolean> {
    try { await stat(this.pathFor(key)); return true; } catch { return false; }
  }
}

// ---------------------------------------------------------------------------
// S3ObjectStore — production (S3, Cloudflare R2, Backblaze B2, any S3-compatible)
// ---------------------------------------------------------------------------
export interface S3Config {
  endpoint: string;      // https://<account>.r2.cloudflarestorage.com  |  https://s3.us-east-1.amazonaws.com
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string; // if the bucket is fronted by a CDN/public domain
}

const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();
const hex = (b: Buffer) => b.toString("hex");
const sha256hex = (d: Buffer | string) => createHash("sha256").update(d).digest("hex");

/**
 * AWS SigV4. Hand-rolled deliberately: the alternative is a multi-megabyte SDK for one
 * PUT, and the signing steps below are directly testable (see objectStore.test.ts,
 * which checks determinism and the canonical-request shape against a local server).
 */
export function signV4(opts: {
  method: string; url: URL; region: string; service: string;
  accessKeyId: string; secretAccessKey: string;
  payloadSha256: string; amzDate: string; headers: Record<string, string>;
}): Record<string, string> {
  const { method, url, region, service, accessKeyId, secretAccessKey, payloadSha256, amzDate } = opts;
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    ...opts.headers,
    host: url.host,
    "x-amz-content-sha256": payloadSha256,
    "x-amz-date": amzDate,
  };
  const signedKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = signedKeys
    .map((k) => `${k}:${String(headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]).trim()}\n`)
    .join("");
  const signedHeaders = signedKeys.join(";");

  const canonicalUri = url.pathname.split("/").map((seg, i) => (i === 0 ? seg : enc(seg))).join("/");
  const canonicalRequest = [
    method, canonicalUri, url.searchParams.toString(),
    canonicalHeaders, signedHeaders, payloadSha256,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hex(hmac(kSigning, stringToSign));

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export class S3ObjectStore implements ObjectStore {
  readonly kind = "s3" as const;
  constructor(private cfg: S3Config, private now: () => Date = () => new Date()) {}

  private urlFor(key: string): URL {
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    return new URL(`${base}/${this.cfg.bucket}/${key.split("/").map(enc).join("/")}`);
  }

  async put(key: string, filePath: string, contentType = "video/mp4"): Promise<PutResult> {
    const body = await readFile(filePath);
    const payloadSha256 = sha256hex(body);
    const url = this.urlFor(key);
    const amzDate = this.now().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const headers = signV4({
      method: "PUT", url, region: this.cfg.region, service: "s3",
      accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey,
      payloadSha256, amzDate,
      headers: { "content-type": contentType, "content-length": String(body.byteLength) },
    });

    const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
    if (!res.ok) {
      // Never echo the Authorization header or key material into logs.
      throw new Error(`objectStore: PUT ${key} failed ${res.status} ${res.statusText}`);
    }
    const uri = this.cfg.publicBaseUrl
      ? `${this.cfg.publicBaseUrl.replace(/\/+$/, "")}/${key}`
      : url.toString();
    return { uri, bytes: body.byteLength, sha256: payloadSha256 };
  }

  async has(key: string): Promise<boolean> {
    const url = this.urlFor(key);
    const amzDate = this.now().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const empty = sha256hex("");
    const headers = signV4({
      method: "HEAD", url, region: this.cfg.region, service: "s3",
      accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey,
      payloadSha256: empty, amzDate, headers: {},
    });
    const res = await fetch(url, { method: "HEAD", headers });
    return res.ok;
  }
}

// ---------------------------------------------------------------------------
export function makeObjectStore(dataDir: string, env: NodeJS.ProcessEnv = process.env): ObjectStore {
  const { S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL } = env;
  if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return new S3ObjectStore({
      endpoint: S3_ENDPOINT, bucket: S3_BUCKET, region: S3_REGION || "auto",
      accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY,
      publicBaseUrl: S3_PUBLIC_BASE_URL,
    });
  }
  if (env.NODE_ENV === "production" && env.ALLOW_EPHEMERAL_ARTIFACTS !== "1") {
    // Same fail-closed reasoning as the render store: a "completed" row pointing at a
    // container-local file is data loss waiting for the next deploy.
    throw new Error(
      "Object storage is required in production (set S3_* env vars). " +
      "Set ALLOW_EPHEMERAL_ARTIFACTS=1 only to knowingly accept artifact loss on deploy.",
    );
  }
  return new LocalObjectStore(join(dataDir, "videos"));
}
