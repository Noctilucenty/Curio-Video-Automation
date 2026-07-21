/**
 * Autopilot HTTP surface.
 *
 * Hard rule: this router NEVER generates. It records intent, enqueues, and returns 202
 * within milliseconds. All expensive work happens in the worker process — a Render
 * deploy or a closed browser tab must not be able to abandon a paid run mid-flight.
 */
import { Router, type Request, type Response } from "express";
import { DEFAULT_RUN_CONFIG, type RunConfig } from "./types.js";
import { progressOf, STAGE_LABELS, BLOCKER_HELP, isBlocked } from "./states.js";
import type { AutopilotStore } from "./store.js";

export interface AutopilotRouteDeps {
  store: AutopilotStore;
  /** Enqueue for the worker. Resolves once durably queued, not once complete. */
  enqueue: (runId: string) => Promise<void>;
}

/** Coerce untrusted JSON into a RunConfig. Never trust the browser with spend. */
export function parseConfig(body: unknown): RunConfig {
  const b = (body ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const platforms = Array.isArray(b.platforms)
    ? (b.platforms.filter((p) => p === "reels" || p === "shorts") as Array<"reels" | "shorts">)
    : DEFAULT_RUN_CONFIG.platforms;

  const allowVeo = b.allowVeo === true;
  return {
    platforms: platforms.length ? platforms : DEFAULT_RUN_CONFIG.platforms,
    targetRuntime: {
      minSeconds: num((b.targetRuntime as any)?.minSeconds, 14.5, 5, 60),
      maxSeconds: num((b.targetRuntime as any)?.maxSeconds, 20, 6, 90),
    },
    // Hard ceiling regardless of what the client claims.
    maxSpendUsd: num(b.maxSpendUsd, DEFAULT_RUN_CONFIG.maxSpendUsd, 0, 100),
    category: typeof b.category === "string" && b.category ? b.category : "auto",
    factualRisk: b.factualRisk === "normal" ? "normal" : "strict",
    visualPolicy:
      b.visualPolicy === "veo_allowed" && allowVeo ? "veo_allowed"
      : b.visualPolicy === "gpt_image_ok" ? "gpt_image_ok"
      : "real_first",
    allowPaidStock: b.allowPaidStock === true,
    allowVeo,
    maxImageCalls: num(b.maxImageCalls, DEFAULT_RUN_CONFIG.maxImageCalls, 0, 40),
    // Veo off => zero video calls, whatever the client asked for.
    maxVideoCalls: allowVeo ? num(b.maxVideoCalls, 1, 0, 12) : 0,
    qualityProfile: b.qualityProfile === "standard" ? "standard" : "premium",
    dryRun: b.dryRun === true,
    maxCorrectionPasses: num(b.maxCorrectionPasses, 1, 0, 3),
  };
}

export function buildAutopilotRoutes(deps: AutopilotRouteDeps): Router {
  const r = Router();
  const { store } = deps;

  r.get("/config", (_req, res) => {
    res.json({ defaults: DEFAULT_RUN_CONFIG, stage_labels: STAGE_LABELS, blocker_help: BLOCKER_HELP });
  });

  // ---- create: 202 + idempotent -------------------------------------------
  r.post("/runs", async (req: Request, res: Response) => {
    const config = parseConfig(req.body);
    const key =
      (req.header("idempotency-key") || (req.body as any)?.idempotency_key || "").trim() || null;

    const { run, created } = await store.createRun({ config, idempotencyKey: key });
    if (created) {
      await store.appendEvent({ runId: run.id, level: "info", stage: null, message: "Run queued." });
      await deps.enqueue(run.id);
    }
    // 202 either way; `created` tells the UI whether the double-click was absorbed.
    res.status(202).json({ ...wire(run), created });
  });

  r.get("/runs", async (_req, res) => {
    const runs = await store.listRuns(50);
    res.json({ runs: runs.map(wire) });
  });

  r.get("/runs/:id", async (req, res) => {
    const run = await store.getRun(String(req.params.id));
    if (!run) { res.status(404).json({ error: "run not found" }); return; }
    const [stages, calls, artifacts, candidates, claims] = await Promise.all([
      store.listStages(run.id), store.listProviderCalls(run.id),
      store.listArtifacts(run.id), store.listCandidates(run.id), store.listClaims(run.id),
    ]);
    res.json({
      ...wire(run),
      stages: stages.map((s) => ({
        stage: s.stage, label: STAGE_LABELS[s.stage], status: s.status,
        attempt: s.attempt, error: s.error ?? null,
        started_at: s.startedAt ?? null, finished_at: s.finishedAt ?? null,
      })),
      provider_calls: calls.map((c) => ({
        stage: c.stage, provider: c.provider, model: c.model, status: c.status,
        operation_id: c.operationId ?? null, estimated_usd: c.estimatedUsd,
        actual_usd: c.actualUsd ?? null, reason: c.reason, verdict: c.verdict ?? null,
      })),
      artifacts: artifacts.map((a) => ({
        kind: a.kind, stage: a.stage, mime_type: a.mimeType, bytes: a.bytes,
        sha256: a.sha256, duration_s: a.durationS, provenance: a.provenance ?? null,
      })),
      topic_candidates: candidates, claims,
    });
  });

  // ---- live progress (SSE) -------------------------------------------------
  r.get("/runs/:id/events", async (req, res) => {
    const run = await store.getRun(String(req.params.id));
    if (!run) { res.status(404).json({ error: "run not found" }); return; }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    let seq = Number(req.query.since ?? 0) || 0;
    let closed = false;
    req.on("close", () => { closed = true; });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Poll the durable event log rather than holding an in-memory bus: with two
    // processes the web service never sees the worker's in-memory emissions.
    while (!closed) {
      const [fresh, events] = await Promise.all([
        store.getRun(req.params.id), store.listEvents(String(req.params.id), seq),
      ]);
      for (const e of events) {
        seq = e.seq;
        send("log", { seq: e.seq, level: e.level, stage: e.stage, message: e.message, data: e.data });
      }
      if (fresh) send("state", wire(fresh));
      if (fresh && ["READY_FOR_REVIEW", "CANCELLED", "FAILED"].includes(fresh.state)) {
        send("done", wire(fresh));
        break;
      }
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    res.end();
  });

  // ---- controls ------------------------------------------------------------
  const control = (
    patch: (id: string) => Promise<unknown>,
  ) => async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const run = await store.getRun(id);
    if (!run) { res.status(404).json({ error: "run not found" }); return; }
    await patch(id);
    const fresh = await store.getRun(id);
    res.json(wire(fresh!));
  };

  r.post("/runs/:id/pause", control(async (id) => store.updateRun(id, { pauseRequested: true })));

  r.post("/runs/:id/resume", control(async (id) => {
    const run = await store.getRun(id);
    // Resuming a blocked run clears the blocker; the stage will re-evaluate its cause.
    await store.updateRun(id, {
      pauseRequested: false,
      state: run && isBlocked(run.state) ? "QUEUED" : run?.state ?? "QUEUED",
      blockerCode: null, blockerDetail: null,
    });
    await deps.enqueue(id);
  }));

  r.post("/runs/:id/cancel", control(async (id) => store.updateRun(id, { cancelRequested: true })));

  r.post("/runs/:id/retry-stage", control(async (id) => {
    await store.updateRun(id, { state: "QUEUED", error: null, blockerCode: null, blockerDetail: null });
    await deps.enqueue(id);
  }));

  r.get("/runs/:id/artifacts", async (req, res) => {
    res.json({ artifacts: await store.listArtifacts(String(req.params.id)) });
  });

  r.get("/runs/:id/costs", async (req, res) => {
    const run = await store.getRun(String(req.params.id));
    if (!run) { res.status(404).json({ error: "run not found" }); return; }
    const calls = await store.listProviderCalls(String(req.params.id));
    res.json({
      budget_usd: run.budgetUsd, spent_usd: run.spentUsd,
      remaining_usd: Number(run.budgetUsd) - Number(run.spentUsd),
      calls: calls.map((c) => ({
        provider: c.provider, stage: c.stage, status: c.status,
        estimated_usd: c.estimatedUsd, actual_usd: c.actualUsd ?? null,
      })),
    });
  });

  r.get("/runs/:id/claims", async (req, res) => {
    res.json({ claims: await store.listClaims(String(req.params.id)) });
  });

  return r;
}

function wire(run: {
  id: string; state: string; topicTitle?: string | null; budgetUsd: number; spentUsd: number;
  dryRun: boolean; blockerCode?: string | null; blockerDetail?: string | null;
  error?: string | null; createdAt: number; updatedAt: number; finishedAt?: number | null;
}) {
  return {
    run_id: run.id,
    state: run.state,
    progress: progressOf(run.state as never),
    stage_label: STAGE_LABELS[run.state as keyof typeof STAGE_LABELS] ?? run.state,
    topic_title: run.topicTitle ?? null,
    budget_usd: Number(run.budgetUsd),
    spent_usd: Number(run.spentUsd),
    dry_run: run.dryRun,
    blocker: run.blockerCode
      ? { code: run.blockerCode, detail: run.blockerDetail, help: BLOCKER_HELP[run.blockerCode] }
      : null,
    error: run.error ?? null,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    finished_at: run.finishedAt ?? null,
  };
}
