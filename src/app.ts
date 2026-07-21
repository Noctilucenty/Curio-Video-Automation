// Express app factory. Kept separate from the listen() entry point so tests can
// mount the app with an in-memory repo + stub clients via supertest (same
// pattern as the main curio server).

import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Config } from "./config.js";
import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { Renderer } from "./heygen.js";
import type { VoiceSynth } from "./voice.js";
import type { PostProcessor } from "./postprocess.js";
import { JobQueue } from "./queue.js";
import { buildRoutes } from "./routes.js";
import {
  assertBootSecurity, authConfigured, csrfProtection, CSRF_COOKIE, CSRF_HEADER,
  issueCsrfToken, issueSession, parseCookies, rateLimit, requireAuth, safeEqual,
  securityHeaders, serializeCookie, SESSION_COOKIE, signArtifactPath,
  verifyArtifactSignature, type AuthConfig,
} from "./security.js";
import { runGenerationPipeline, finalizeManualEdit, runPostProcess, type PipelineDeps } from "./pipeline.js";

export interface AppDeps {
  config: Config;
  repo: Repo;
  llm: LlmClient;
  renderer: Renderer;
  voice: VoiceSynth;
  post: PostProcessor;
}

export interface App {
  app: Express;
  queue: JobQueue;
}

export function createApp(deps: AppDeps): App {
  const { config, repo, llm, renderer, voice, post } = deps;

  const pipelineDeps: PipelineDeps = {
    repo, llm, renderer, voice, post,
    avatarId: config.heygen.avatarId,
    voiceId: config.heygen.voiceId,
    intelligenceDir: join(config.dataDir, "viral-intelligence"),
  };

  const queue = new JobQueue({
    generate: ({ videoId }) => runGenerationPipeline(pipelineDeps, videoId).then(() => undefined),
    finalize_edit: ({ videoId }) => finalizeManualEdit(pipelineDeps, videoId).then(() => undefined),
    postprocess: async ({ videoId }) => {
      const video = await repo.getVideo(videoId);
      if (!video) throw new Error(`video not found: ${videoId}`);
      await runPostProcess(pipelineDeps, video);
    },
  });

  const auth: AuthConfig = {
    sessionSecret: config.sessionSecret,
    adminPassword: config.adminPassword,
    adminToken: config.adminToken,
    isProd: config.isProd,
    sessionSecretFromEnv: config.sessionSecretFromEnv,
    // In production this is forced false — assertBootSecurity also rejects the flag
    // outright, so there is no path to a public production dashboard.
    allowInsecureNoAuth: config.isProd ? false : true,
  };
  // Fails the boot rather than serving an unauthenticated dashboard to the internet.
  assertBootSecurity(auth);

  const app = express();
  app.disable("x-powered-by");
  // Render terminates TLS; without this, req.protocol is http and Secure cookies
  // would never be set on a genuinely https deployment.
  app.set("trust proxy", 1);
  app.use(securityHeaders(config.isProd));
  app.use(express.json({ limit: "1mb" }));

  // The ONLY unauthenticated endpoints: liveness, and the login page + endpoint.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  const gate = requireAuth(auth);
  // CSRF defends a SESSION. When no credential is configured (local dev / tests) there
  // is no session to forge, so the check would only reject legitimate credential-less
  // calls. Mount it exactly when authentication is real.
  const csrf = authConfigured(auth)
    ? csrfProtection({ allowedOrigins: () => config.allowedOrigins })
    : ((_q: Request, _s: Response, n: NextFunction) => { n(); });

  // --- login / logout ------------------------------------------------------
  // Brute-force ceiling. Deliberately strict: one owner, so a human never needs
  // more than a handful of attempts, and an attacker gets almost none.
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

  app.post("/api/auth/login", loginLimiter, (req: Request, res: Response) => {
    const supplied = String((req.body as { password?: unknown } | undefined)?.password ?? "");
    if (!config.adminPassword) {
      res.status(503).json({ error: "password login is not configured" });
      return;
    }
    if (!supplied || !safeEqual(supplied, config.adminPassword)) {
      // Same message and shape for both wrong-password and missing-password so the
      // response cannot be used to probe configuration.
      res.status(401).json({ error: "invalid credentials" });
      return;
    }
    const csrfToken = issueCsrfToken();
    res.setHeader("set-cookie", [
      serializeCookie(SESSION_COOKIE, issueSession(config.sessionSecret), {
        httpOnly: true, secure: config.isProd, sameSite: "Strict", maxAgeMs: 12 * 60 * 60 * 1000,
      }),
      // Readable by JS on purpose: this is the double-submit half of CSRF.
      serializeCookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false, secure: config.isProd, sameSite: "Strict", maxAgeMs: 12 * 60 * 60 * 1000,
      }),
    ]);
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.setHeader("set-cookie", [
      serializeCookie(SESSION_COOKIE, "", { httpOnly: true, secure: config.isProd, maxAgeMs: 0 }),
      serializeCookie(CSRF_COOKIE, "", { httpOnly: false, secure: config.isProd, maxAgeMs: 0 }),
    ]);
    res.json({ ok: true });
  });

  app.get("/api/auth/session", gate, (req: Request, res: Response) => {
    // Re-issue the CSRF cookie if a valid session exists without one (e.g. after a
    // cookie was cleared) so the dashboard can recover without a re-login.
    if (!parseCookies(req.headers.cookie)[CSRF_COOKIE]) {
      res.setHeader("set-cookie", serializeCookie(CSRF_COOKIE, issueCsrfToken(), {
        httpOnly: false, secure: config.isProd, sameSite: "Strict", maxAgeMs: 12 * 60 * 60 * 1000,
      }));
    }
    res.json({ authenticated: true, auth_configured: authConfigured(auth) });
  });

  // --- everything below is PRIVATE ----------------------------------------
  // GET included: the previous model left reads, videos and analytics world-readable.
  app.use("/api", gate, csrf);

  // Generation is the expensive verb; cap it independently of the login limiter.
  app.use("/api/videos/generate", rateLimit({ windowMs: 60 * 60_000, max: 30 }));
  app.use("/api/autopilot/runs", rateLimit({ windowMs: 60 * 60_000, max: 30 }));

  app.use("/api", buildRoutes({ repo, llm, renderer, voice, post, queue, cardsFrozen: config.cardsFrozen }));

  // --- media: session OR a short-lived signed URL --------------------------
  // Signed URLs exist so a <video> tag can play without cookies on a cross-origin
  // CDN later, and so a leaked link expires instead of granting permanent access.
  app.get("/api/media/sign", gate, (req: Request, res: Response) => {
    const target = String(req.query.path ?? "");
    if (!target.startsWith("/videos/") || target.includes("..")) {
      res.status(400).json({ error: "invalid path" });
      return;
    }
    res.json({ url: signArtifactPath(config.sessionSecret, target) });
  });

  app.use("/videos", (req: Request, res: Response, next: NextFunction) => {
    const full = `/videos${req.path}`;
    if (verifyArtifactSignature(config.sessionSecret, full,
        req.query.exp as string | undefined, req.query.sig as string | undefined)) {
      next();
      return;
    }
    gate(req, res, next);
  }, express.static(join(config.dataDir, "videos"), { dotfiles: "deny", index: false }));

  // Dashboard shell. Static assets carry no secrets; the API behind them is gated.
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  app.use(express.static(publicDir, { dotfiles: "deny" }));

  // Central error handler: anything async that leaked through becomes a clean 500.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] unhandled:", err);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  });

  return { app, queue };
}
