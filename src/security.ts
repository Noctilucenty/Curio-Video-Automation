/**
 * Security primitives for the internet-facing deployment.
 *
 * Threat model: a single-owner dashboard on a public URL. The realistic attacks are
 * (a) someone finding the URL and reading/triggering runs, (b) a malicious page in the
 * owner's browser firing cross-site mutations, (c) credential stuffing on login, and
 * (d) artifact URLs leaking permanent access to masters.
 *
 * Design notes worth knowing before changing anything here:
 *  - Sessions are STATELESS HMAC tokens, not a server-side store. A single-owner app
 *    gains nothing from a session table, and statelessness means a worker restart or a
 *    second web instance doesn't log the owner out.
 *  - Every secret comparison is timing-safe. The previous `header === \`Bearer ${tok}\``
 *    was a plain string compare, which leaks length/prefix under timing analysis.
 *  - No new dependencies: cookies are parsed here rather than pulling in cookie-parser,
 *    because the parsing we need is ~10 lines and a dependency is a supply-chain risk.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE = "curio_session";
export const CSRF_COOKIE = "curio_csrf";
export const CSRF_HEADER = "x-curio-csrf";

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const ARTIFACT_TTL_MS = 5 * 60 * 1000;              // 5m — "short-lived" per spec

/** Timing-safe string compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still burn a comparison so the failure path costs the same as a mismatch.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(secret: string, data: string): string {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

// ---------------------------------------------------------------------------
// cookies
// ---------------------------------------------------------------------------
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeMs?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Strict" | "Lax" | "None" } = {},
): string {
  const bits = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
  if (opts.maxAgeMs !== undefined) bits.push(`Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`);
  if (opts.httpOnly !== false) bits.push("HttpOnly");
  if (opts.secure) bits.push("Secure");
  bits.push(`SameSite=${opts.sameSite ?? "Strict"}`);
  return bits.join("; ");
}

// ---------------------------------------------------------------------------
// stateless sessions
// ---------------------------------------------------------------------------
export interface SessionPayload { sub: string; exp: number }

export function issueSession(secret: string, sub = "owner", ttlMs = DEFAULT_SESSION_TTL_MS): string {
  const payload: SessionPayload = { sub, exp: Date.now() + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${hmac(secret, body)}`;
}

export function verifySession(secret: string, token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// short-lived signed artifact access
// ---------------------------------------------------------------------------
export function signArtifactPath(secret: string, path: string, ttlMs = ARTIFACT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const sig = hmac(secret, `${path}:${exp}`);
  return `${path}?exp=${exp}&sig=${sig}`;
}

export function verifyArtifactSignature(
  secret: string, path: string, exp: string | undefined, sig: string | undefined,
): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  return safeEqual(sig, hmac(secret, `${path}:${expNum}`));
}

// ---------------------------------------------------------------------------
// rate limiting (in-memory, per-process)
// ---------------------------------------------------------------------------
export interface RateLimitOptions { windowMs: number; max: number; key?: (req: Request) => string }

export function rateLimit(opts: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Bounded sweep so a hostile IP range can't grow the map without limit.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.min(opts.windowMs, 60_000));
  if (typeof sweep.unref === "function") sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key ? opts.key(req) : clientIp(req);
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    rec.count += 1;
    if (rec.count > opts.max) {
      res.setHeader("retry-after", Math.ceil((rec.resetAt - now) / 1000));
      res.status(429).json({ error: "too many requests" });
      return;
    }
    next();
  };
}

export function clientIp(req: Request): string {
  // Render terminates TLS and forwards the client IP. Take the FIRST hop only —
  // later entries are attacker-controlled.
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// security headers
// ---------------------------------------------------------------------------
export function securityHeaders(isProd: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cross-origin-opener-policy", "same-origin");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    // The dashboard is one self-contained file: no CDNs, no inline eval. 'unsafe-inline'
    // is required only because index.html carries an inline <style>/<script> block.
    res.setHeader(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; "),
    );
    if (isProd) {
      res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// CSRF / origin
// ---------------------------------------------------------------------------
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function issueCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Double-submit CSRF + Origin validation on state-changing requests.
 *
 * A Bearer-authenticated request is exempt: bearer tokens are not sent automatically
 * by browsers, so there is no cross-site forgery vector, and requiring CSRF there
 * would break every API client and CI job.
 */
export function csrfProtection(opts: { allowedOrigins: () => string[] }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) { next(); return; }
    if ((req.headers.authorization ?? "").startsWith("Bearer ")) { next(); return; }

    const origin = req.headers.origin as string | undefined;
    const referer = req.headers.referer as string | undefined;
    const allowed = opts.allowedOrigins();
    const source = origin ?? (referer ? safeOrigin(referer) : undefined);

    if (source && allowed.length && !allowed.includes(source)) {
      res.status(403).json({ error: "cross-origin request rejected" });
      return;
    }
    // No Origin AND no Referer on a mutation is characteristic of a forged/scripted
    // request; a real browser form or fetch always sends at least one.
    if (!source) {
      res.status(403).json({ error: "missing origin" });
      return;
    }

    const cookie = parseCookies(req.headers.cookie)[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER] as string | undefined;
    if (!cookie || !header || !safeEqual(cookie, header)) {
      res.status(403).json({ error: "invalid csrf token" });
      return;
    }
    next();
  };
}

function safeOrigin(url: string): string | undefined {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// authentication gate
// ---------------------------------------------------------------------------
export interface AuthConfig {
  sessionSecret: string;
  adminPassword: string | null;
  adminToken: string | null;
  isProd: boolean;
  /** Explicit opt-in to run with no credentials at all (local dev / tests). */
  allowInsecureNoAuth: boolean;
  /** False when sessionSecret is a random dev fallback rather than SESSION_SECRET. */
  sessionSecretFromEnv?: boolean;
}

export function authConfigured(c: AuthConfig): boolean {
  return Boolean(c.adminPassword || c.adminToken);
}

/**
 * PRIVATE BY DEFAULT.
 *
 * Everything behind this is denied unless the caller presents a valid session cookie
 * or a valid bearer token. The one escape hatch is an unconfigured non-production
 * process (local dev, tests) — and even then the server refuses to boot in production
 * without credentials, so a misconfigured deploy fails loudly instead of silently
 * serving the whole dashboard to the internet.
 */
export function requireAuth(c: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!authConfigured(c) && c.allowInsecureNoAuth) { next(); return; }

    const header = req.headers.authorization ?? "";
    if (c.adminToken && header.startsWith("Bearer ")) {
      if (safeEqual(header.slice(7), c.adminToken)) { next(); return; }
      res.status(401).json({ error: "invalid token" });
      return;
    }

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (verifySession(c.sessionSecret, token)) { next(); return; }

    res.status(401).json({ error: "authentication required" });
  };
}

/**
 * Boot-time guard — FAIL CLOSED.
 *
 * In production BOTH are mandatory:
 *   ADMIN_PASSWORD  — an ADMIN_TOKEN alone is not enough. A bearer token is for API
 *                     clients; without a password there is no way to sign in to the
 *                     dashboard, and operators would be tempted to re-open reads.
 *   SESSION_SECRET  — must come from the environment. The dev fallback is random per
 *                     boot, so on Render every restart (and every second instance)
 *                     would silently invalidate sessions, and nothing would surface
 *                     that the secret was never configured.
 *
 * Credential-less/public mode is only ever possible outside production.
 */
export function assertBootSecurity(c: AuthConfig): void {
  if (!c.isProd) return;

  const missing: string[] = [];
  if (!c.adminPassword) missing.push("ADMIN_PASSWORD");
  if (c.sessionSecretFromEnv === false) missing.push("SESSION_SECRET");

  if (missing.length) {
    throw new Error(
      `refusing to start: NODE_ENV=production requires ${missing.join(" and ")}. ` +
      "Without them the dashboard, API, videos and artifacts would be exposed or " +
      "sessions would break on every restart. Set them in Render → Environment.",
    );
  }
  if (c.sessionSecret.length < 32) {
    throw new Error("refusing to start: SESSION_SECRET must be at least 32 characters in production.");
  }
  if (c.allowInsecureNoAuth) {
    throw new Error("refusing to start: ALLOW_INSECURE_NO_AUTH is not permitted in production.");
  }
}
