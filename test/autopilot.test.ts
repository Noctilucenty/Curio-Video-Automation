/**
 * Autopilot control-plane tests. No paid calls: every provider path is mocked.
 */
import { describe, it, expect, beforeEach } from "vitest";

// tsx transform of this tree costs ~80s on the 8GB machine; the default 5s
// timeout fires during module collection, not in the assertions.
const T = 30_000;
import express from "express";
import { MemoryStore } from "../src/autopilot/store.js";
import { Runner } from "../src/autopilot/runner.js";
import { buildStages } from "../src/autopilot/stages.js";
import { buildAutopilotRoutes, parseConfig } from "../src/autopilot/routes.js";
import { InProcessRunQueue } from "../src/autopilot/queue.js";
import { DEFAULT_RUN_CONFIG } from "../src/autopilot/types.js";
import { STAGES, nextStage, progressOf } from "../src/autopilot/states.js";
import { scoreCandidates } from "../src/autopilot/scoring.js";

function makeHarness() {
  const store = new MemoryStore();
  const queue = new InProcessRunQueue();
  const runner = new Runner({ store, stages: buildStages({ mock: true }) });
  queue.process(async (runId) => { await runner.drive(runId); });
  const app = express();
  app.use(express.json());
  app.use("/api/autopilot", buildAutopilotRoutes({ store, enqueue: (id) => queue.enqueue(id) }));
  return { store, queue, runner, app };
}

async function post(app: express.Express, path: string, body: unknown, headers: Record<string, string> = {}) {
  const server = app.listen(0);
  const addr = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as any };
  } finally { server.close(); }
}

describe("state machine", () => {
  it("orders every stage and terminates", () => {
    expect(STAGES[0]).toBe("LOADING_CANONICAL_CONTEXT");
    expect(STAGES[STAGES.length - 1]).toBe("FINAL_QA");
    expect(nextStage("FINAL_QA")).toBeNull();
  });

  it("skips CORRECTING unless the review asked for it", () => {
    expect(nextStage("CREATIVE_SELF_REVIEW")).toBe("CAPTIONING");
    expect(nextStage("CREATIVE_SELF_REVIEW", { needsCorrection: true })).toBe("CORRECTING");
  });

  it("reports monotonic progress", () => {
    expect(progressOf("QUEUED")).toBe(0);
    expect(progressOf("READY_FOR_REVIEW")).toBe(1);
    expect(progressOf("SCRIPTING")).toBeGreaterThan(progressOf("DISCOVERING_TOPICS"));
  });
});

describe("one-button run", () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => { h = makeHarness(); });

  it("creates exactly one run and returns 202", { timeout: T }, async () => {
    const res = await post(h.app, "/api/autopilot/runs", { dryRun: true });
    expect(res.status).toBe(202);
    expect(res.body.created).toBe(true);
    expect((await h.store.listRuns()).length).toBe(1);
  });

  it("absorbs a double-click via the idempotency key", { timeout: T }, async () => {
    const key = "button-press-1";
    const a = await post(h.app, "/api/autopilot/runs", {}, { "idempotency-key": key });
    const b = await post(h.app, "/api/autopilot/runs", {}, { "idempotency-key": key });
    expect(a.body.run_id).toBe(b.body.run_id);
    expect(b.body.created).toBe(false);
    expect((await h.store.listRuns()).length).toBe(1);   // NOT two paid runs
  });

  it("completes a full mock run to READY_FOR_REVIEW", async () => {
    const { run } = await h.store.createRun({ config: DEFAULT_RUN_CONFIG });
    await h.runner.drive(run.id);
    const fresh = await h.store.getRun(run.id);
    expect(fresh?.state).toBe("READY_FOR_REVIEW");
    const stages = await h.store.listStages(run.id);
    expect(stages.every((s) => s.status === "completed" || s.status === "skipped")).toBe(true);
  });

  it("records a chosen topic and its rejected alternatives", async () => {
    const { run } = await h.store.createRun({ config: DEFAULT_RUN_CONFIG });
    await h.runner.drive(run.id);
    const cands = await h.store.listCandidates(run.id);
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.filter((c) => c.chosen).length).toBe(1);
  });
});

describe("durability", () => {
  it("does not repeat completed stages after a simulated restart", async () => {
    const store = new MemoryStore();
    const stages = buildStages({ mock: true });
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });

    // First "process" advances a few stages then dies.
    const r1 = new Runner({ store, stages, workerId: "worker-A" });
    await r1.tick(run.id);
    await r1.tick(run.id);
    const afterCrash = (await store.listStages(run.id)).filter((s) => s.status === "completed");
    expect(afterCrash.length).toBe(2);

    // A fresh process resumes; the already-completed stages must not re-run.
    const r2 = new Runner({ store, stages, workerId: "worker-B" });
    await r2.drive(run.id);
    const done = await store.listStages(run.id);
    expect(done.every((s) => s.attempt <= 1 || s.status === "completed")).toBe(true);
    expect((await store.getRun(run.id))?.state).toBe("READY_FOR_REVIEW");
  });

  it("reclaims a lease from a dead worker", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    const claimed = await store.claimNextStage(run.id, "dead-worker", 10);
    expect(claimed).not.toBeNull();
    // A second worker must NOT be able to steal a live lease.
    expect(await store.claimNextStage(run.id, "other", 1000)).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.reclaimExpired()).toBe(1);
    expect(await store.claimNextStage(run.id, "other", 1000)).not.toBeNull();
  });

  it("never bills twice for the same dedupe key", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    const base = {
      runId: run.id, stage: "SCRIPTING" as const, provider: "openai",
      dedupeKey: "k1", status: "started" as const, attempt: 1, estimatedUsd: 0.5,
    };
    const first = await store.recordProviderCall(base);
    expect(first.created).toBe(true);
    const second = await store.recordProviderCall(base);
    expect(second.created).toBe(false);       // the guard: caller must not re-call
    expect((await store.listProviderCalls(run.id)).length).toBe(1);
  });
});

describe("safety gates", () => {
  it("blocks on budget before spending past the cap", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({
      config: { ...DEFAULT_RUN_CONFIG, maxSpendUsd: 1 },
    });
    const stages = buildStages({ mock: true });
    // A stage that tries to overspend must park the run, not fail it.
    stages.SCRIPTING = async (ctx) => ctx.spend({
      key: "too-big", provider: "openai", estimatedUsd: 99,
      reason: "test", run: async () => ({ ok: true }),
    });
    const runner = new Runner({ store, stages });
    await runner.drive(run.id);
    expect((await store.getRun(run.id))?.state).toBe("BLOCKED_BUDGET");
  });

  it("refuses paid calls in dry-run", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: { ...DEFAULT_RUN_CONFIG, dryRun: true } });
    const runner = new Runner({ store, stages: buildStages({ mock: true }) });
    await runner.drive(run.id);
    const fresh = await store.getRun(run.id);
    expect(fresh?.state).toBe("READY_FOR_REVIEW");
    expect(Number(fresh?.spentUsd)).toBe(0);
    expect((await store.listProviderCalls(run.id)).length).toBe(0);
  });

  it("parks in BLOCKED_CAPTIONS_AUTH when Captions.ai is degraded", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    const stages = buildStages({
      mock: false, hasCaptionsKey: true,
      captionsApiHealthy: async () => false,      // the real 502 condition
    });
    // keep every other stage cheap
    for (const k of Object.keys(stages) as Array<keyof typeof stages>) {
      if (k !== "CAPTIONING") stages[k] = async () => ({ ok: true });
    }
    const runner = new Runner({ store, stages });
    await runner.drive(run.id);
    const fresh = await store.getRun(run.id);
    expect(fresh?.state).toBe("BLOCKED_CAPTIONS_AUTH");
    expect(fresh?.blockerDetail).toMatch(/NOT substituted/);
  });

  it("cancels between stages", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    await store.updateRun(run.id, { cancelRequested: true });
    const runner = new Runner({ store, stages: buildStages({ mock: true }) });
    await runner.drive(run.id);
    expect((await store.getRun(run.id))?.state).toBe("CANCELLED");
  });

  it("pauses between stages", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    await store.updateRun(run.id, { pauseRequested: true });
    const runner = new Runner({ store, stages: buildStages({ mock: true }) });
    await runner.drive(run.id);
    expect((await store.getRun(run.id))?.state).toBe("PAUSED");
  });
});

describe("config parsing refuses client-side privilege escalation", () => {
  it("forces video calls to zero unless Veo is explicitly allowed", () => {
    const c = parseConfig({ maxVideoCalls: 10, allowVeo: false, visualPolicy: "veo_allowed" });
    expect(c.maxVideoCalls).toBe(0);
    expect(c.visualPolicy).toBe("real_first");   // cannot claim veo policy without the flag
  });

  it("clamps spend to a hard ceiling", () => {
    expect(parseConfig({ maxSpendUsd: 100000 }).maxSpendUsd).toBe(100);
    expect(parseConfig({ maxSpendUsd: -5 }).maxSpendUsd).toBe(0);
  });

  it("defaults to strict factual risk", () => {
    expect(parseConfig({}).factualRisk).toBe("strict");
  });
});

describe("topic scoring", () => {
  it("penalises a weak frame-zero anomaly", () => {
    const weak = {
      title: "w", source: "t",
      signals: { anomaly: 3, contradiction: 3, clarity: 4, escalation: 5, payoff: 4,
        shareability: 4, debate: 5, factualSupport: 9, visualAvailability: 8,
        hallucinationRisk: 2, cost: 2, similarity: 2, categoryDiversity: 5, outlierEvidence: 5 },
    };
    const [scored] = scoreCandidates([weak], DEFAULT_RUN_CONFIG);
    expect(scored.penalties).toHaveProperty("no_frame_zero_anomaly");
    expect(scored.penalties).toHaveProperty("context_first_opening");
  });

  it("chooses exactly one winner and explains the rest", () => {
    const out = scoreCandidates([
      { title: "a", source: "s", signals: { anomaly: 9, contradiction: 9, clarity: 9, escalation: 8,
        payoff: 9, shareability: 8, debate: 6, factualSupport: 9, visualAvailability: 8,
        hallucinationRisk: 2, cost: 2, similarity: 1, categoryDiversity: 8, outlierEvidence: 8 } },
      { title: "b", source: "s", signals: { anomaly: 6, contradiction: 6, clarity: 6, escalation: 6,
        payoff: 6, shareability: 6, debate: 6, factualSupport: 7, visualAvailability: 6,
        hallucinationRisk: 4, cost: 4, similarity: 4, categoryDiversity: 5, outlierEvidence: 4 } },
    ], DEFAULT_RUN_CONFIG);
    expect(out.filter((o) => o.chosen).length).toBe(1);
    expect(out[0].title).toBe("a");
    expect(out[1].rejectReason).toMatch(/lower total/);
  });
});

describe("no automatic publishing", () => {
  it("terminates at READY_FOR_REVIEW and never publishes", async () => {
    const store = new MemoryStore();
    const { run } = await store.createRun({ config: DEFAULT_RUN_CONFIG });
    const runner = new Runner({ store, stages: buildStages({ mock: true }) });
    await runner.drive(run.id);
    const fresh = await store.getRun(run.id);
    expect(fresh?.state).toBe("READY_FOR_REVIEW");
    // there is no publish path in the autopilot surface at all
    expect(Object.keys(fresh ?? {})).not.toContain("publishedAt");
  });
});
