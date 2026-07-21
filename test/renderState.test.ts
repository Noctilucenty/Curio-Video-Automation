/**
 * Durable cross-process render state.
 *
 * These simulate the production topology: WEB and WORKER are separate processes,
 * workers restart on every deploy, and neither can see the other's memory. Each test
 * shares ONLY the store between "processes" — if a test passed because two objects
 * shared a field, the fix would not be real.
 *
 * The whole contract runs twice: once against the memory adapter (dev/test) and once
 * against PgRenderStore driving a real PostgreSQL engine (PGlite, in-process WASM),
 * with the real migrations applied. That second pass is what actually verifies the
 * SQL — the claim guard, ON CONFLICT and the lease predicates are the parts that
 * prevent duplicate renders, and typechecking cannot tell you whether they work.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalRenderer } from "../src/localRenderer.js";
import {
  MemoryRenderStore, PgRenderStore, renderIdempotencyKey, makeRenderStore,
  type RenderStore,
} from "../src/renderStore.js";

const LEASE = 10 * 60_000;
const dataDir = () => mkdtempSync(join(tmpdir(), "renderstate-"));

// --- real Postgres, in-process ----------------------------------------------
let pglite: any = null;
async function makePgStore(): Promise<RenderStore | null> {
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    pglite = new PGlite();
    for (const f of ["001_autopilot.sql", "002_render_jobs.sql"]) {
      await pglite.exec(readFileSync(join(process.cwd(), "db/migrations", f), "utf8"));
    }
    const store = new PgRenderStore("postgres://pglite", {
      query: async (text: string, values?: unknown[]) => {
        const r = await pglite.query(text, values ?? []);
        // pg reports UPDATE/DELETE counts via rowCount; PGlite via affectedRows.
        // Getting this wrong makes reclaimExpired() silently return 0 — which is how
        // a real lease-reclaim bug would hide behind a green test.
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
    });
    await store.init();
    return store;
  } catch (e) {
    console.error("PGlite unavailable, skipping real-Postgres contract:", e);
    return null;
  }
}

/** The contract every adapter must satisfy — identical assertions, both backends. */
function contract(label: string, get: () => RenderStore) {
  describe(`render state is durable and cross-process [${label}]`, () => {
    let store: RenderStore;
    let n = 0;
    const id = (s: string) => `${label}-${s}-${++n}`;

    beforeAll(() => { store = get(); });

    it("1. worker A starts a render and web process B reads its status", async () => {
      const a = id("vid"), dir = dataDir();
      // Two distinct renderer objects = two distinct processes; only the store is shared.
      const workerA = new LocalRenderer(dir, store, "worker-A");
      const webB = new LocalRenderer(dir, store, "web-B");

      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", LEASE);

      // B never saw the render begin and shares no memory with A.
      expect((await webB.pollUntilDone(a)).status).toBe("rendering");

      await store.complete(a, { outputUri: `/videos/${a}.mp4`, outputSha256: "abc" });
      const done = await webB.pollUntilDone(a);
      expect(done.status).toBe("completed");
      expect(done.videoUrl).toBe(`/videos/${a}.mp4`);
      expect(workerA).toBeDefined();
    });

    it("2. worker A dies mid-render — the job survives as owned, unstealable state", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", LEASE);

      // "A dies": no completion, no failure, just silence. The row persists.
      const job = await store.get(a);
      expect(job?.status).toBe("running");
      expect(job?.leaseOwner).toBe("worker-A");
      // Nobody may steal it while the lease is live.
      expect(await store.claim(a, "worker-C", LEASE)).toBeNull();
    });

    it("3. the lease expires", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", 5);
      await new Promise((r) => setTimeout(r, 30));

      expect(await store.reclaimExpired()).toBeGreaterThanOrEqual(1);
      const job = await store.get(a);
      expect(job?.status).toBe("queued");
      expect(job?.leaseOwner).toBeNull();
    });

    it("4. worker C resumes safely after the lease expires", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", 5);
      await new Promise((r) => setTimeout(r, 30));
      await store.reclaimExpired();

      const resumed = await store.claim(a, "worker-C", LEASE);
      expect(resumed).not.toBeNull();
      expect(resumed!.leaseOwner).toBe("worker-C");
      expect(resumed!.attempt).toBe(2);   // retries stay visible rather than silent

      await store.complete(a, { outputUri: `/videos/${a}.mp4`, outputSha256: "d" });
      expect((await store.get(a))?.status).toBe("completed");
    });

    it("5. an already completed artifact is not rendered twice", async () => {
      const a = id("vid");
      const key = renderIdempotencyKey({ script: `s-${a}`, captionLines: [{ t: 1 }] });

      const first = await store.create({ id: a, idempotencyKey: key });
      expect(first.created).toBe(true);
      await store.complete(a, { outputUri: `/videos/${a}.mp4`, outputSha256: "sha" });

      // A restarted worker recomputes the SAME key from the same inputs.
      const second = await store.create({ id: `${a}-retry`, idempotencyKey: key });
      expect(second.created).toBe(false);              // no second job row
      expect(second.job.id).toBe(a);                   // the original artifact
      expect(second.job.outputUri).toBe(`/videos/${a}.mp4`);

      // A completed job can never be claimed for re-rendering.
      expect(await store.claim(a, "worker-Z", LEASE)).toBeNull();
    });

    it("6. polling still works after ALL original process memory is gone", async () => {
      const a = id("vid"), dir = dataDir();

      // "Process 1" renders, then is destroyed entirely.
      let gone: LocalRenderer | null = new LocalRenderer(dir, store, "worker-gone");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-gone", LEASE);
      await store.complete(a, { outputUri: `/videos/${a}.mp4`, outputSha256: "z" });
      gone = null;
      expect(gone).toBeNull();

      // "Process 2" boots fresh, sharing nothing but the store.
      const fresh = new LocalRenderer(dir, store, "web-fresh");
      const status = await fresh.pollUntilDone(a);
      expect(status.status).toBe("completed");
      expect(status.videoUrl).toBe(`/videos/${a}.mp4`);
    });

    it("reports an unknown id rather than inventing a status", async () => {
      const r = new LocalRenderer(dataDir(), store, "w");
      const s = await r.pollUntilDone("does-not-exist-anywhere");
      expect(s.status).toBe("failed");
      expect(s.error).toMatch(/unknown local render id/);
    });

    it("surfaces a failed render with its error across processes", async () => {
      const a = id("vid");
      const webB = new LocalRenderer(dataDir(), store, "web-B");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", LEASE);
      await store.fail(a, "ffmpeg exploded", { retryAfterMs: 60_000 });

      const s = await webB.pollUntilDone(a);
      expect(s.status).toBe("failed");
      expect(s.error).toBe("ffmpeg exploded");
      const job = await store.get(a);
      expect(job?.retryCount).toBe(1);
      expect(job?.retryAfter).toBeGreaterThan(Date.now());
    });

    it("heartbeats extend the lease so a long render is not stolen", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", 60);
      await new Promise((r) => setTimeout(r, 30));
      await store.heartbeat(a, "worker-A", 600_000, 0.5);

      await new Promise((r) => setTimeout(r, 50));
      // Without the heartbeat the 60ms lease would have expired by now.
      expect(await store.claim(a, "worker-C", LEASE)).toBeNull();
      expect((await store.get(a))?.status).toBe("running");
      expect(Number((await store.get(a))?.progress)).toBeCloseTo(0.5, 3);
    });

    it("a foreign worker's heartbeat cannot keep a job it does not own", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", 5);
      await store.heartbeat(a, "worker-IMPOSTOR", 600_000, 0.9);
      await new Promise((r) => setTimeout(r, 30));

      // The impostor must not have extended anything.
      expect(await store.reclaimExpired()).toBeGreaterThanOrEqual(1);
      expect((await store.get(a))?.status).toBe("queued");
    });

    it("records output hash, size and probe evidence at completion", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      await store.claim(a, "worker-A", LEASE);
      await store.complete(a, {
        outputUri: `s3://bucket/${a}.mp4`, outputSha256: "deadbeef",
        outputBytes: 1234, probe: { streams: [{ width: 1080, height: 1920 }] },
      });
      const j = await store.get(a);
      expect(j?.outputUri).toBe(`s3://bucket/${a}.mp4`);
      expect(j?.outputSha256).toBe("deadbeef");
      expect(Number(j?.outputBytes)).toBe(1234);
      expect(j?.probe).toBeTruthy();
      expect(Number(j?.progress)).toBe(1);
      expect(j?.finishedAt).toBeTruthy();
    });

    it("only ONE of many concurrent workers can claim the same render", async () => {
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a });
      // The real race: several workers pull the same queue message at once.
      const claims = await Promise.all(
        ["w1", "w2", "w3", "w4", "w5"].map((w) => store.claim(a, w, LEASE)),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
    });

    it("groups renders by run so the dashboard can show a run's artifacts", async () => {
      const runId = "11111111-1111-4111-8111-111111111111";
      const a = id("vid");
      await store.create({ id: a, idempotencyKey: a, runId, stage: "assemble" });
      const rows = await store.listByRun(runId);
      expect(rows.map((r) => r.id)).toContain(a);
      expect(rows.find((r) => r.id === a)?.stage).toBe("assemble");
    });
  });
}

contract("memory", () => new MemoryRenderStore());

// Real PostgreSQL. If PGlite cannot start we FAIL rather than silently skipping —
// a quietly-skipped durability test is how untested SQL reaches production.
describe("real Postgres adapter", () => {
  let pg: RenderStore | null = null;
  beforeAll(async () => { pg = await makePgStore(); });
  afterAll(async () => { try { await pglite?.close?.(); } catch { /* nothing to close */ } });

  it("starts a real PostgreSQL engine and applies the real migrations", async () => {
    expect(pg).not.toBeNull();
    const r = await pglite.query("select count(*)::int as n from render_jobs");
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0);
  });

  contract("postgres", () => pg!);
});

describe("fail-closed configuration", () => {
  it("refuses to run production render state in memory", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(makeRenderStore(null)).rejects.toThrow(/DATABASE_URL is required/);
      await expect(makeRenderStore("postgres://127.0.0.1:1/nope")).rejects.toThrow(/unavailable in production/);
    } finally { process.env.NODE_ENV = prev; }
  });

  it("still allows the memory adapter outside production", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      expect(await makeRenderStore(null)).toBeInstanceOf(MemoryRenderStore);
    } finally { process.env.NODE_ENV = prev; }
  });
});

describe("idempotency key", () => {
  it("is stable for identical inputs and differs when any input changes", () => {
    const base = { script: "a", captionLines: [{ text: "x" }], audioSha256: "h1" };
    expect(renderIdempotencyKey(base)).toBe(renderIdempotencyKey({ ...base }));
    expect(renderIdempotencyKey({ ...base, script: "b" })).not.toBe(renderIdempotencyKey(base));
    expect(renderIdempotencyKey({ ...base, audioSha256: "h2" })).not.toBe(renderIdempotencyKey(base));
    // A composition change must invalidate old artifacts rather than reuse them.
    expect(renderIdempotencyKey({ ...base, rendererVersion: "local-v2" }))
      .not.toBe(renderIdempotencyKey(base));
  });
});
