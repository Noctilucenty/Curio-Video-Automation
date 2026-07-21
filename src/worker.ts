/**
 * Curio background worker — the process that actually produces videos.
 *
 * Runs as a separate Render service (see render.yaml). It shares the image with the
 * web service but never serves HTTP: it consumes run IDs from BullMQ, drives the
 * state machine one stage at a time, and checkpoints to Postgres after every stage so
 * a deploy mid-run resumes instead of re-spending.
 */
try { process.loadEnvFile(); } catch { /* env comes from Render in production */ }

import { makeStore } from "./autopilot/store.js";
import { makeRunQueue } from "./autopilot/queue.js";
import { Runner, LEASE_MS } from "./autopilot/runner.js";
import { buildStages, probeCaptionsApi } from "./autopilot/stages.js";

const WORKER_ID = `worker-${process.env.RENDER_INSTANCE_ID ?? process.pid}`;

async function main() {
  const store = await makeStore(process.env.DATABASE_URL ?? null);
  await store.init();
  const queue = await makeRunQueue(process.env.REDIS_URL ?? null);

  // Same rule as config.ts: no key => mock, never crash.
  const mock = !process.env.OPENAI_API_KEY;
  const stages = buildStages({
    mock,
    hasCaptionsKey: Boolean(process.env.CAPTIONS_API_KEY),
    captionsApiHealthy: () => probeCaptionsApi(process.env.CAPTIONS_API_BASE),
  });

  const runner = new Runner({ store, stages, workerId: WORKER_ID });

  queue.process(async (runId) => {
    console.log(JSON.stringify({ t: new Date().toISOString(), worker: WORKER_ID, runId, msg: "picked up" }));
    await runner.drive(runId);
  });

  // Sweep leases abandoned by workers that died without releasing them. Without this
  // a crashed worker would leave a run wedged until the lease TTL on every restart.
  const sweep = setInterval(() => {
    void store.reclaimExpired().then((n) => {
      if (n) console.log(JSON.stringify({ worker: WORKER_ID, reclaimed: n }));
    });
  }, Math.max(10_000, Math.floor(LEASE_MS / 2)));
  if (typeof sweep.unref === "function") sweep.unref();

  console.log(
    `[worker] ${WORKER_ID} ready · store=${process.env.DATABASE_URL ? "postgres" : "memory"} ` +
    `· queue=${process.env.REDIS_URL ? "bullmq" : "in-process"} · providers=${mock ? "MOCK" : "live"}`,
  );

  // Graceful shutdown: stop taking new work and let the in-flight stage finish so it
  // can checkpoint. Render sends SIGTERM then SIGKILLs after a grace period.
  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    console.log(`[worker] ${sig} — draining, will not claim new stages`);
    clearInterval(sweep);
    try { await queue.close(); } catch { /* best effort */ }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
