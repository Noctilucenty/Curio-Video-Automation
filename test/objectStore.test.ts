/**
 * Object storage for rendered artifacts.
 *
 * The S3 path is exercised against a real local HTTP server rather than a mocked
 * fetch: that way the bytes, the signature headers and the error handling are all
 * genuinely produced by the code under test. What is NOT verified here is that AWS/R2
 * accepts the signature — that needs a real bucket and is honestly untested.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  LocalObjectStore, S3ObjectStore, makeObjectStore, signV4, sha256File,
} from "../src/objectStore.js";

const dir = () => mkdtempSync(join(tmpdir(), "objstore-"));
function fixture(bytes = "hello-video"): string {
  const d = dir(), p = join(d, "src.mp4");
  writeFileSync(p, bytes);
  return p;
}

describe("LocalObjectStore", () => {
  it("stores the file and reports its true size and hash", async () => {
    const root = dir(), src = fixture("abcdef");
    const s = new LocalObjectStore(root);
    const r = await s.put("vid-1.mp4", src);

    expect(r.uri).toBe("/videos/vid-1.mp4");
    expect(r.bytes).toBe(6);
    expect(r.sha256).toBe(createHash("sha256").update("abcdef").digest("hex"));
    expect(readFileSync(join(root, "vid-1.mp4"), "utf8")).toBe("abcdef");
    expect(await s.has("vid-1.mp4")).toBe(true);
    expect(await s.has("nope.mp4")).toBe(false);
  });

  it("is idempotent — re-uploading the same key yields the same result", async () => {
    const s = new LocalObjectStore(dir()), src = fixture("same");
    const a = await s.put("k.mp4", src);
    const b = await s.put("k.mp4", src);
    expect(b).toEqual(a);
  });

  it("refuses keys that escape the root", async () => {
    const s = new LocalObjectStore(dir()), src = fixture();
    await expect(s.put("../../etc/passwd", src)).rejects.toThrow(/escapes root|empty key/);
    await expect(s.put("..", src)).rejects.toThrow(/empty key|escapes root/);
  });
});

describe("S3ObjectStore against a real HTTP endpoint", () => {
  let server: Server;
  let base = "";
  const received: { method: string; url: string; headers: IncomingMessage["headers"]; body: Buffer }[] = [];
  let respond: () => { status: number } = () => ({ status: 200 });

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        received.push({
          method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks),
        });
        res.writeHead(respond().status).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const store = () => new S3ObjectStore({
    endpoint: base, bucket: "curio", region: "auto",
    accessKeyId: "AKIAEXAMPLE", secretAccessKey: "secret-key",
  }, () => new Date(Date.UTC(2026, 6, 20, 12, 0, 0)));

  it("PUTs the exact bytes to bucket/key with a SigV4 authorization header", async () => {
    received.length = 0;
    respond = () => ({ status: 200 });
    const src = fixture("video-bytes-here");
    const r = await store().put("renders/vid-9.mp4", src);

    expect(received).toHaveLength(1);
    const got = received[0];
    expect(got.method).toBe("PUT");
    expect(got.url).toBe("/curio/renders/vid-9.mp4");
    expect(got.body.toString()).toBe("video-bytes-here");        // bytes arrive intact
    expect(got.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    expect(got.headers["x-amz-content-sha256"]).toBe(await sha256File(src));
    expect(got.headers["x-amz-date"]).toBe("20260720T120000Z");
    expect(r.uri).toBe(`${base}/curio/renders/vid-9.mp4`);
    expect(r.bytes).toBe(16);
  });

  it("uses the public base URL for the recorded artifact URI when configured", async () => {
    received.length = 0;
    const s = new S3ObjectStore({
      endpoint: base, bucket: "curio", region: "auto",
      accessKeyId: "A", secretAccessKey: "B", publicBaseUrl: "https://cdn.example.com/",
    });
    const r = await s.put("vid-10.mp4", fixture());
    expect(r.uri).toBe("https://cdn.example.com/vid-10.mp4");
  });

  it("throws on a rejected upload and never leaks credentials in the message", async () => {
    respond = () => ({ status: 403 });
    const err = await store().put("vid-11.mp4", fixture()).catch((e: Error) => e);
    respond = () => ({ status: 200 });

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/failed 403/);
    expect((err as Error).message).not.toMatch(/secret-key|AWS4-HMAC|Signature=/);
  });

  it("has() reports presence via HEAD", async () => {
    respond = () => ({ status: 200 });
    expect(await store().has("vid-12.mp4")).toBe(true);
    respond = () => ({ status: 404 });
    expect(await store().has("vid-12.mp4")).toBe(false);
    respond = () => ({ status: 200 });
  });
});

describe("signV4", () => {
  const args = {
    method: "PUT", url: new URL("https://s3.example.com/bucket/key.mp4"),
    region: "us-east-1", service: "s3",
    accessKeyId: "AKID", secretAccessKey: "SECRET",
    payloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    amzDate: "20260720T120000Z", headers: { "content-type": "video/mp4" },
  };

  it("is deterministic for identical inputs", () => {
    expect(signV4(args).authorization).toBe(signV4(args).authorization);
  });

  it("changes the signature when the payload, key or date changes", () => {
    const baseSig = signV4(args).authorization;
    expect(signV4({ ...args, payloadSha256: "0".repeat(64) }).authorization).not.toBe(baseSig);
    expect(signV4({ ...args, url: new URL("https://s3.example.com/bucket/other.mp4") }).authorization)
      .not.toBe(baseSig);
    expect(signV4({ ...args, amzDate: "20260721T120000Z" }).authorization).not.toBe(baseSig);
    expect(signV4({ ...args, secretAccessKey: "OTHER" }).authorization).not.toBe(baseSig);
  });

  it("signs host, date and content hash", () => {
    const h = signV4(args);
    expect(h.authorization).toMatch(/SignedHeaders=[^,]*host/);
    expect(h.authorization).toMatch(/SignedHeaders=[^,]*x-amz-content-sha256/);
    expect(h.authorization).toMatch(/SignedHeaders=[^,]*x-amz-date/);
  });
});

describe("makeObjectStore", () => {
  it("selects S3 when fully configured", () => {
    const s = makeObjectStore("/tmp/x", {
      S3_ENDPOINT: "https://e", S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s",
    } as NodeJS.ProcessEnv);
    expect(s.kind).toBe("s3");
  });

  it("falls back to local storage outside production", () => {
    expect(makeObjectStore("/tmp/x", { NODE_ENV: "test" } as NodeJS.ProcessEnv).kind).toBe("local");
  });

  it("refuses ephemeral artifact storage in production", () => {
    expect(() => makeObjectStore("/tmp/x", { NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toThrow(/Object storage is required in production/);
  });

  it("allows ephemeral storage only when explicitly and knowingly opted into", () => {
    const s = makeObjectStore("/tmp/x", {
      NODE_ENV: "production", ALLOW_EPHEMERAL_ARTIFACTS: "1",
    } as NodeJS.ProcessEnv);
    expect(s.kind).toBe("local");
  });
});
