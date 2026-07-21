/**
 * Security gate tests.
 *
 * These assert the properties that matter for an internet-facing single-owner
 * dashboard. Several of them encode bugs that existed before this pass:
 *   - every GET under /api was world-readable
 *   - /videos/*.mp4 was served with no auth at all
 *   - the bearer token was compared with `===` (not timing-safe)
 *   - the browser held the admin token in localStorage
 */
import { describe, it, expect } from "vitest";
import express from "express";
import {
  csrfProtection, CSRF_COOKIE, CSRF_HEADER, issueSession, verifySession,
  parseCookies, rateLimit, requireAuth, safeEqual, securityHeaders, serializeCookie,
  signArtifactPath, verifyArtifactSignature, assertBootSecurity, issueCsrfToken,
  type AuthConfig,
} from "../src/security.js";

const SECRET = "unit-test-secret-unit-test-secret-64chars-padding-padding-padding";

function baseAuth(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    sessionSecret: SECRET, adminPassword: "hunter2", adminToken: null,
    isProd: false, allowInsecureNoAuth: false, ...over,
  };
}

async function call(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } finally { server.close(); }
}

describe("sessions", () => {
  it("round-trips a signed session", () => {
    const t = issueSession(SECRET);
    expect(verifySession(SECRET, t)?.sub).toBe("owner");
  });

  it("rejects a session signed with a different secret", () => {
    expect(verifySession("other-secret", issueSession(SECRET))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const t = issueSession(SECRET);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "attacker", exp: Date.now() + 1e6 }))
      .toString("base64url");
    expect(verifySession(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("rejects an expired session", () => {
    expect(verifySession(SECRET, issueSession(SECRET, "owner", -1000))).toBeNull();
  });
});

describe("timing-safe compare", () => {
  it("matches equal strings and rejects unequal ones, including length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcdef")).toBe(false);   // must not throw
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("private by default", () => {
  const mount = (auth: AuthConfig) => {
    const app = express();
    app.use("/api", requireAuth(auth));
    app.get("/api/videos", (_q, r) => { r.json({ ok: true }); });
    app.post("/api/videos/generate", (_q, r) => { r.json({ ok: true }); });
    return app;
  };

  it("denies an unauthenticated GET (previously world-readable)", async () => {
    const res = await call(mount(baseAuth()), "/api/videos");
    expect(res.status).toBe(401);
  });

  it("denies an unauthenticated POST", async () => {
    const res = await call(mount(baseAuth()), "/api/videos/generate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("allows a valid session cookie", async () => {
    const res = await call(mount(baseAuth()), "/api/videos", {
      headers: { cookie: `curio_session=${issueSession(SECRET)}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows a valid bearer token but rejects a wrong one", async () => {
    const auth = baseAuth({ adminToken: "tok-abc" });
    expect((await call(mount(auth), "/api/videos",
      { headers: { authorization: "Bearer tok-abc" } })).status).toBe(200);
    expect((await call(mount(auth), "/api/videos",
      { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("only opens up when explicitly unconfigured AND opted in", async () => {
    const open = baseAuth({ adminPassword: null, adminToken: null, allowInsecureNoAuth: true });
    expect((await call(mount(open), "/api/videos")).status).toBe(200);
    const closed = baseAuth({ adminPassword: null, adminToken: null, allowInsecureNoAuth: false });
    expect((await call(mount(closed), "/api/videos")).status).toBe(401);
  });
});

describe("boot guard", () => {
  it("refuses production with no credentials", () => {
    expect(() => assertBootSecurity(
      baseAuth({ isProd: true, adminPassword: null, adminToken: null })
    )).toThrow(/refusing to start/);
  });

  it("refuses production with a weak session secret", () => {
    expect(() => assertBootSecurity(baseAuth({ isProd: true, sessionSecret: "short" })))
      .toThrow(/SESSION_SECRET/);
  });

  it("permits production when properly configured", () => {
    expect(() => assertBootSecurity(baseAuth({ isProd: true }))).not.toThrow();
  });
});

describe("CSRF / origin", () => {
  const mount = () => {
    const app = express();
    app.use(csrfProtection({ allowedOrigins: () => ["https://curio.example"] }));
    app.post("/x", (_q, r) => { r.json({ ok: true }); });
    app.get("/x", (_q, r) => { r.json({ ok: true }); });
    return app;
  };

  it("allows safe methods without a token", async () => {
    expect((await call(mount(), "/x")).status).toBe(200);
  });

  it("rejects a mutation with no origin", async () => {
    expect((await call(mount(), "/x", { method: "POST" })).status).toBe(403);
  });

  it("rejects a cross-origin mutation", async () => {
    const res = await call(mount(), "/x", {
      method: "POST", headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/cross-origin/);
  });

  it("rejects a same-origin mutation without the double-submit token", async () => {
    const res = await call(mount(), "/x", {
      method: "POST", headers: { origin: "https://curio.example" },
    });
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/csrf/);
  });

  it("accepts a matching cookie+header pair", async () => {
    const t = issueCsrfToken();
    const res = await call(mount(), "/x", {
      method: "POST",
      headers: { origin: "https://curio.example", cookie: `${CSRF_COOKIE}=${t}`, [CSRF_HEADER]: t },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a mismatched cookie/header pair", async () => {
    const res = await call(mount(), "/x", {
      method: "POST",
      headers: { origin: "https://curio.example", cookie: `${CSRF_COOKIE}=aaa`, [CSRF_HEADER]: "bbb" },
    });
    expect(res.status).toBe(403);
  });

  it("exempts bearer-authenticated calls (no browser CSRF vector)", async () => {
    const res = await call(mount(), "/x", {
      method: "POST", headers: { authorization: "Bearer abc" },
    });
    expect(res.status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("blocks past the ceiling and reports retry-after", async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, max: 2, key: () => "fixed" }));
    app.get("/x", (_q, r) => { r.json({ ok: true }); });
    expect((await call(app, "/x")).status).toBe(200);
    expect((await call(app, "/x")).status).toBe(200);
    const third = await call(app, "/x");
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
  });
});

describe("short-lived artifact URLs", () => {
  it("verifies a fresh signature", () => {
    const url = signArtifactPath(SECRET, "/videos/a.mp4");
    const u = new URL(`http://x${url}`);
    expect(verifyArtifactSignature(
      SECRET, "/videos/a.mp4", u.searchParams.get("exp")!, u.searchParams.get("sig")!)).toBe(true);
  });

  it("rejects an expired signature", () => {
    const url = signArtifactPath(SECRET, "/videos/a.mp4", -1000);
    const u = new URL(`http://x${url}`);
    expect(verifyArtifactSignature(
      SECRET, "/videos/a.mp4", u.searchParams.get("exp")!, u.searchParams.get("sig")!)).toBe(false);
  });

  it("rejects a signature bound to a different path", () => {
    const url = signArtifactPath(SECRET, "/videos/a.mp4");
    const u = new URL(`http://x${url}`);
    expect(verifyArtifactSignature(
      SECRET, "/videos/OTHER.mp4", u.searchParams.get("exp")!, u.searchParams.get("sig")!)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyArtifactSignature(SECRET, "/videos/a.mp4", undefined, undefined)).toBe(false);
  });
});

describe("security headers", () => {
  it("sets the hardening set and omits HSTS off production", async () => {
    const app = express();
    app.use(securityHeaders(false));
    app.get("/x", (_q, r) => { r.json({ ok: true }); });
    const res = await call(app, "/x");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("sets HSTS in production", async () => {
    const app = express();
    app.use(securityHeaders(true));
    app.get("/x", (_q, r) => { r.json({ ok: true }); });
    const res = await call(app, "/x");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=31536000/);
  });
});

describe("cookies", () => {
  it("parses and ignores malformed pairs", () => {
    const c = parseCookies("a=1; b=two; broken; c=%2Fpath");
    expect(c.a).toBe("1");
    expect(c.b).toBe("two");
    expect(c.c).toBe("/path");
    expect(c.broken).toBeUndefined();
  });

  it("serializes an HttpOnly Secure SameSite cookie", () => {
    const s = serializeCookie("k", "v", { httpOnly: true, secure: true, sameSite: "Strict", maxAgeMs: 60_000 });
    expect(s).toMatch(/HttpOnly/);
    expect(s).toMatch(/Secure/);
    expect(s).toMatch(/SameSite=Strict/);
    expect(s).toMatch(/Max-Age=60/);
  });
});
