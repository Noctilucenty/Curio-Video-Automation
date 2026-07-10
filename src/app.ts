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
import { JobQueue } from "./queue.js";
import { buildRoutes } from "./routes.js";
import { runGenerationPipeline, finalizeManualEdit, type PipelineDeps } from "./pipeline.js";

export interface AppDeps {
  config: Config;
  repo: Repo;
  llm: LlmClient;
  renderer: Renderer;
}

export interface App {
  app: Express;
  queue: JobQueue;
}

export function createApp(deps: AppDeps): App {
  const { config, repo, llm, renderer } = deps;

  const pipelineDeps: PipelineDeps = {
    repo, llm, renderer,
    avatarId: config.heygen.avatarId,
    voiceId: config.heygen.voiceId,
  };

  const queue = new JobQueue({
    generate: ({ videoId }) => runGenerationPipeline(pipelineDeps, videoId).then(() => undefined),
    finalize_edit: ({ videoId }) => finalizeManualEdit(pipelineDeps, videoId).then(() => undefined),
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), renderer: renderer.provider, model: llm.model });
  });

  // Bearer auth on all mutations when ADMIN_TOKEN is set; reads stay open so
  // the dashboard can render before the token is pasted in.
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (!config.adminToken || req.method === "GET") { next(); return; }
    const header = req.headers.authorization ?? "";
    if (header === `Bearer ${config.adminToken}`) { next(); return; }
    res.status(401).json({ error: "missing or invalid admin token" });
  });

  app.use("/api", buildRoutes({ repo, llm, renderer, queue }));

  // Review dashboard (static single page hitting the API above).
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  app.use(express.static(publicDir));

  // Central error handler: anything async that leaked through becomes a clean 500.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] unhandled:", err);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  });

  return { app, queue };
}
