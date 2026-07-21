/**
 * Durable store for autopilot runs.
 *
 * Two implementations behind one interface, chosen by DATABASE_URL — the same
 * "missing credential => degrade, never crash" rule config.ts already follows:
 *   - PgStore       (production; Render Postgres)
 *   - MemoryStore   (tests + local dev; also the JSON-repo story)
 *
 * The three methods that carry the real weight:
 *   createRun          — idempotency-key insert; a double-click returns the SAME run
 *   claimNextStage     — atomic lease so two workers can't run one stage
 *   recordProviderCall — UNIQUE dedupe key; a retry after restart cannot bill twice
 */
import { randomUUID } from "node:crypto";
import { STAGES, type Stage, type RunState } from "./states.js";
import type {
  Artifact, Claim, ProviderCall, Run, RunConfig, RunEvent, StageRow, TopicCandidate,
} from "./types.js";

export interface ClaimedStage {
  run: Run;
  stage: Stage;
  attempt: number;
}

export interface AutopilotStore {
  init(): Promise<void>;
  createRun(input: {
    config: RunConfig;
    idempotencyKey?: string | null;
  }): Promise<{ run: Run; created: boolean }>;
  getRun(id: string): Promise<Run | null>;
  listRuns(limit?: number): Promise<Run[]>;
  updateRun(id: string, patch: Partial<Run>): Promise<Run>;
  listStages(runId: string): Promise<StageRow[]>;
  /** Atomically lease the next runnable stage of this run. Null if none. */
  claimNextStage(runId: string, owner: string, leaseMs: number): Promise<ClaimedStage | null>;
  heartbeat(runId: string, stage: Stage, owner: string, leaseMs: number): Promise<void>;
  completeStage(runId: string, stage: Stage, output: unknown): Promise<void>;
  failStage(runId: string, stage: Stage, error: string): Promise<void>;
  /** Release leases whose owner died, so another worker can resume. */
  reclaimExpired(now?: number): Promise<number>;
  /**
   * Returns the EXISTING call when dedupeKey was already used (created=false).
   * Callers MUST treat created=false as "do not call the provider again".
   */
  recordProviderCall(call: Omit<ProviderCall, "id" | "createdAt">): Promise<{ call: ProviderCall; created: boolean }>;
  finishProviderCall(dedupeKey: string, patch: Partial<ProviderCall>): Promise<void>;
  listProviderCalls(runId: string): Promise<ProviderCall[]>;
  addArtifact(a: Omit<Artifact, "id" | "createdAt">): Promise<Artifact>;
  listArtifacts(runId: string): Promise<Artifact[]>;
  appendEvent(e: Omit<RunEvent, "seq" | "createdAt">): Promise<RunEvent>;
  listEvents(runId: string, sinceSeq?: number): Promise<RunEvent[]>;
  saveCandidates(runId: string, c: TopicCandidate[]): Promise<void>;
  listCandidates(runId: string): Promise<TopicCandidate[]>;
  saveClaims(runId: string, c: Claim[]): Promise<void>;
  listClaims(runId: string): Promise<Claim[]>;
}

const now = () => Date.now();

// ---------------------------------------------------------------------------
// MemoryStore — tests and local dev. Same semantics as PgStore, no durability.
// ---------------------------------------------------------------------------
export class MemoryStore implements AutopilotStore {
  private runs = new Map<string, Run>();
  private byKey = new Map<string, string>();
  private stages = new Map<string, StageRow[]>();
  private calls = new Map<string, ProviderCall>();
  private artifacts: Artifact[] = [];
  private events = new Map<string, RunEvent[]>();
  private candidates = new Map<string, TopicCandidate[]>();
  private claims = new Map<string, Claim[]>();

  async init(): Promise<void> {}

  async createRun(input: { config: RunConfig; idempotencyKey?: string | null }) {
    const key = input.idempotencyKey ?? null;
    if (key) {
      const existing = this.byKey.get(key);
      if (existing) return { run: this.runs.get(existing)!, created: false };
    }
    const id = randomUUID();
    const run: Run = {
      id,
      idempotencyKey: key,
      state: "QUEUED",
      config: input.config,
      budgetUsd: input.config.maxSpendUsd,
      spentUsd: 0,
      dryRun: input.config.dryRun,
      correctionPasses: 0,
      cancelRequested: false,
      pauseRequested: false,
      createdAt: now(),
      updatedAt: now(),
    };
    this.runs.set(id, run);
    if (key) this.byKey.set(key, id);
    this.stages.set(
      id,
      STAGES.map((s) => ({ runId: id, stage: s, status: "pending" as const, attempt: 0 })),
    );
    return { run, created: true };
  }

  async getRun(id: string) { return this.runs.get(id) ?? null; }

  async listRuns(limit = 50) {
    return [...this.runs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async updateRun(id: string, patch: Partial<Run>) {
    const r = this.runs.get(id);
    if (!r) throw new Error(`run not found: ${id}`);
    Object.assign(r, patch, { updatedAt: now() });
    return r;
  }

  async listStages(runId: string) { return this.stages.get(runId) ?? []; }

  async claimNextStage(runId: string, owner: string, leaseMs: number) {
    const run = this.runs.get(runId);
    if (!run) return null;
    const rows = this.stages.get(runId) ?? [];
    for (const s of rows) {
      if (s.status === "completed" || s.status === "skipped") continue;
      // someone else holds a live lease
      if (s.status === "running" && (s.leaseExpiresAt ?? 0) > now()) return null;
      s.status = "running";
      s.attempt += 1;
      s.leaseOwner = owner;
      s.leaseExpiresAt = now() + leaseMs;
      s.heartbeatAt = now();
      s.startedAt ??= now();
      return { run, stage: s.stage, attempt: s.attempt };
    }
    return null;
  }

  async heartbeat(runId: string, stage: Stage, owner: string, leaseMs: number) {
    const s = (this.stages.get(runId) ?? []).find((x) => x.stage === stage);
    if (s && s.leaseOwner === owner) {
      s.leaseExpiresAt = now() + leaseMs;
      s.heartbeatAt = now();
    }
  }

  async completeStage(runId: string, stage: Stage, output: unknown) {
    const s = (this.stages.get(runId) ?? []).find((x) => x.stage === stage);
    if (!s) return;
    s.status = "completed"; s.output = output; s.finishedAt = now();
    s.leaseOwner = null; s.leaseExpiresAt = null;
  }

  async failStage(runId: string, stage: Stage, error: string) {
    const s = (this.stages.get(runId) ?? []).find((x) => x.stage === stage);
    if (!s) return;
    s.status = "failed"; s.error = error; s.finishedAt = now();
    s.leaseOwner = null; s.leaseExpiresAt = null;
  }

  async reclaimExpired(t = now()) {
    let n = 0;
    for (const rows of this.stages.values()) {
      for (const s of rows) {
        if (s.status === "running" && (s.leaseExpiresAt ?? 0) <= t) {
          s.status = "pending"; s.leaseOwner = null; s.leaseExpiresAt = null; n++;
        }
      }
    }
    return n;
  }

  async recordProviderCall(call: Omit<ProviderCall, "id" | "createdAt">) {
    const existing = this.calls.get(call.dedupeKey);
    if (existing) return { call: existing, created: false };
    const rec: ProviderCall = { ...call, createdAt: now() };
    this.calls.set(call.dedupeKey, rec);
    return { call: rec, created: true };
  }

  async finishProviderCall(dedupeKey: string, patch: Partial<ProviderCall>) {
    const c = this.calls.get(dedupeKey);
    if (c) Object.assign(c, patch);
  }

  async listProviderCalls(runId: string) {
    return [...this.calls.values()].filter((c) => c.runId === runId);
  }

  async addArtifact(a: Omit<Artifact, "id" | "createdAt">) {
    const rec: Artifact = { ...a, id: this.artifacts.length + 1, createdAt: now() };
    this.artifacts.push(rec);
    return rec;
  }

  async listArtifacts(runId: string) { return this.artifacts.filter((a) => a.runId === runId); }

  async appendEvent(e: Omit<RunEvent, "seq" | "createdAt">) {
    const list = this.events.get(e.runId) ?? [];
    const rec: RunEvent = { ...e, seq: list.length + 1, createdAt: now() };
    list.push(rec);
    this.events.set(e.runId, list);
    return rec;
  }

  async listEvents(runId: string, sinceSeq = 0) {
    return (this.events.get(runId) ?? []).filter((e) => e.seq > sinceSeq);
  }

  async saveCandidates(runId: string, c: TopicCandidate[]) { this.candidates.set(runId, c); }
  async listCandidates(runId: string) {
    return (this.candidates.get(runId) ?? []).slice().sort((a, b) => b.totalScore - a.totalScore);
  }
  async saveClaims(runId: string, c: Claim[]) { this.claims.set(runId, c); }
  async listClaims(runId: string) { return this.claims.get(runId) ?? []; }
}

/**
 * Chooses the store. Postgres when DATABASE_URL is set AND `pg` is installed,
 * otherwise memory — so `npm test` and a bare `npm run dev` work with no services.
 */
export async function makeStore(databaseUrl?: string | null): Promise<AutopilotStore> {
  if (!databaseUrl) return new MemoryStore();
  try {
    const { PgStore } = await import("./pgStore.js");
    const store = new PgStore(databaseUrl);
    await store.init();
    return store;
  } catch (e) {
    // Loud, not silent: running the control plane on memory in production would
    // lose runs on every deploy. Callers log this at boot.
    console.error("[autopilot] Postgres store unavailable, falling back to memory:", e);
    return new MemoryStore();
  }
}
