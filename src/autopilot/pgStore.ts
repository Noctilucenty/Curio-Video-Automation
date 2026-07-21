/**
 * Postgres-backed store — the production source of truth.
 *
 * `pg` is an optionalDependency and is imported dynamically, so a machine without it
 * (tests, local dev) still typechecks and boots; makeStore() falls back to memory and
 * logs loudly.
 *
 * The two queries that carry the real weight are commented inline: the atomic stage
 * claim and the ON CONFLICT provider-call insert. Everything else is bookkeeping.
 */
import { STAGES, type Stage } from "./states.js";
import type { AutopilotStore, ClaimedStage } from "./store.js";
import type {
  Artifact, Claim, ProviderCall, Run, RunConfig, RunEvent, StageRow, TopicCandidate,
} from "./types.js";

type Client = {
  query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};
type Pool = Client & { end(): Promise<void> };

export class PgStore implements AutopilotStore {
  private pool!: Pool;

  constructor(private url: string) {}

  async init(): Promise<void> {
    // Indirect specifier: `pg` is an optionalDependency and may be absent at
    // typecheck time. Runtime shape is asserted by the connection probe below.
    const spec = "pg";
    const pg = (await import(spec)) as unknown as { default?: any; Pool?: any };
    const PoolCtor = (pg as any).Pool ?? (pg as any).default?.Pool;
    if (!PoolCtor) throw new Error("pg: Pool constructor not found");
    this.pool = new PoolCtor({
      connectionString: this.url,
      // Render Postgres terminates idle connections; keep the pool small and honest.
      max: 5,
      idleTimeoutMillis: 30_000,
      ssl: this.url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    await this.pool.query("select 1");
  }

  // ---- runs ---------------------------------------------------------------
  async createRun(input: { config: RunConfig; idempotencyKey?: string | null }) {
    const key = input.idempotencyKey ?? null;
    if (key) {
      const found = await this.pool.query(`select * from autopilot_runs where idempotency_key = $1`, [key]);
      if (found.rows.length) return { run: rowToRun(found.rows[0]), created: false };
    }
    const { rows } = await this.pool.query(
      `insert into autopilot_runs (id, idempotency_key, state, config, budget_usd, dry_run, max_correction_passes)
       values (gen_random_uuid(), $1, 'QUEUED', $2::jsonb, $3, $4, $5)
       -- a racing second click hits the unique index and returns nothing; we then
       -- re-select the winner below, so both clicks see the SAME run.
       on conflict (idempotency_key) do nothing
       returning *`,
      [key, JSON.stringify(input.config), input.config.maxSpendUsd, input.config.dryRun,
       input.config.maxCorrectionPasses],
    );
    if (!rows.length) {
      const again = await this.pool.query(`select * from autopilot_runs where idempotency_key = $1`, [key]);
      return { run: rowToRun(again.rows[0]), created: false };
    }
    const run = rowToRun(rows[0]);
    // Seed the stage ledger so claimNextStage has rows to lease.
    await this.pool.query(
      `insert into autopilot_stages (run_id, stage, status)
       select $1, unnest($2::text[]), 'pending'
       on conflict (run_id, stage) do nothing`,
      [run.id, STAGES as unknown as string[]],
    );
    return { run, created: true };
  }

  async getRun(id: string) {
    const { rows } = await this.pool.query(`select * from autopilot_runs where id = $1`, [id]);
    return rows.length ? rowToRun(rows[0]) : null;
  }

  async listRuns(limit = 50) {
    const { rows } = await this.pool.query(
      `select * from autopilot_runs order by created_at desc limit $1`, [limit]);
    return rows.map(rowToRun);
  }

  async updateRun(id: string, patch: Partial<Run>) {
    const map: Record<string, string> = {
      state: "state", spentUsd: "spent_usd", budgetUsd: "budget_usd",
      topicId: "topic_id", topicTitle: "topic_title", blockerCode: "blocker_code",
      blockerDetail: "blocker_detail", error: "error", cancelRequested: "cancel_requested",
      pauseRequested: "pause_requested", correctionPasses: "correction_passes",
      startedAt: "started_at", finishedAt: "finished_at",
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = map[k];
      if (!col) continue;
      vals.push(col.endsWith("_at") && typeof v === "number" ? new Date(v) : v);
      sets.push(`${col} = $${vals.length}`);
    }
    sets.push(`updated_at = now()`);
    vals.push(id);
    const { rows } = await this.pool.query(
      `update autopilot_runs set ${sets.join(", ")} where id = $${vals.length} returning *`, vals);
    if (!rows.length) throw new Error(`run not found: ${id}`);
    return rowToRun(rows[0]);
  }

  // ---- stages -------------------------------------------------------------
  async listStages(runId: string) {
    const { rows } = await this.pool.query(
      `select * from autopilot_stages where run_id = $1 order by id`, [runId]);
    return rows.map(rowToStage);
  }

  async claimNextStage(runId: string, owner: string, leaseMs: number): Promise<ClaimedStage | null> {
    // ONE statement, so two workers cannot both win. The inner select picks the first
    // stage that is neither finished nor under a live lease; FOR UPDATE SKIP LOCKED
    // means a concurrent claimer moves on instead of blocking.
    const { rows } = await this.pool.query(
      `update autopilot_stages s
          set status = 'running',
              attempt = s.attempt + 1,
              lease_owner = $2,
              lease_expires_at = now() + ($3::int * interval '1 millisecond'),
              heartbeat_at = now(),
              started_at = coalesce(s.started_at, now())
        where s.id = (
          select id from autopilot_stages
           where run_id = $1
             and status not in ('completed','skipped')
             and (status <> 'running' or lease_expires_at < now())
           order by id
           limit 1
           for update skip locked
        )
      returning s.*`,
      [runId, owner, leaseMs],
    );
    if (!rows.length) return null;
    const run = await this.getRun(runId);
    if (!run) return null;
    return { run, stage: rows[0].stage as Stage, attempt: rows[0].attempt as number };
  }

  async heartbeat(runId: string, stage: Stage, owner: string, leaseMs: number) {
    await this.pool.query(
      `update autopilot_stages
          set lease_expires_at = now() + ($4::int * interval '1 millisecond'), heartbeat_at = now()
        where run_id = $1 and stage = $2 and lease_owner = $3`,
      [runId, stage, owner, leaseMs]);
  }

  async completeStage(runId: string, stage: Stage, output: unknown) {
    await this.pool.query(
      `update autopilot_stages
          set status='completed', output=$3::jsonb, finished_at=now(),
              lease_owner=null, lease_expires_at=null
        where run_id=$1 and stage=$2`,
      [runId, stage, JSON.stringify(output ?? null)]);
  }

  async failStage(runId: string, stage: Stage, error: string) {
    await this.pool.query(
      `update autopilot_stages
          set status='failed', error=$3, finished_at=now(),
              lease_owner=null, lease_expires_at=null
        where run_id=$1 and stage=$2`,
      [runId, stage, error]);
  }

  async reclaimExpired(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `update autopilot_stages
          set status='pending', lease_owner=null, lease_expires_at=null
        where status='running' and lease_expires_at < now()`);
    return rowCount ?? 0;
  }

  // ---- provider calls -----------------------------------------------------
  async recordProviderCall(call: Omit<ProviderCall, "id" | "createdAt">) {
    // THE duplicate-spend guard. If dedupe_key already exists the insert does nothing
    // and we return the recorded row with created=false — callers must not re-call.
    const { rows } = await this.pool.query(
      `insert into provider_calls
         (run_id, stage, provider, model, dedupe_key, status, attempt, prompt, reason, estimated_usd)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (dedupe_key) do nothing
       returning *`,
      [call.runId, call.stage, call.provider, call.model ?? null, call.dedupeKey,
       call.status, call.attempt, call.prompt ?? null, call.reason ?? null, call.estimatedUsd],
    );
    if (rows.length) return { call: rowToCall(rows[0]), created: true };
    const existing = await this.pool.query(`select * from provider_calls where dedupe_key = $1`, [call.dedupeKey]);
    return { call: rowToCall(existing.rows[0]), created: false };
  }

  async finishProviderCall(dedupeKey: string, patch: Partial<ProviderCall>) {
    const map: Record<string, string> = {
      status: "status", operationId: "operation_id", actualUsd: "actual_usd",
      responseMeta: "response_meta", verdict: "verdict",
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = map[k];
      if (!col) continue;
      vals.push(col === "response_meta" ? JSON.stringify(v ?? null) : v);
      sets.push(`${col} = $${vals.length}${col === "response_meta" ? "::jsonb" : ""}`);
    }
    if (!sets.length) return;
    sets.push("updated_at = now()");
    vals.push(dedupeKey);
    await this.pool.query(
      `update provider_calls set ${sets.join(", ")} where dedupe_key = $${vals.length}`, vals);
  }

  async listProviderCalls(runId: string) {
    const { rows } = await this.pool.query(
      `select * from provider_calls where run_id=$1 order by id`, [runId]);
    return rows.map(rowToCall);
  }

  // ---- artifacts / events / candidates / claims ---------------------------
  async addArtifact(a: Omit<Artifact, "id" | "createdAt">) {
    const { rows } = await this.pool.query(
      `insert into autopilot_artifacts
         (run_id, stage, kind, storage_key, storage_driver, mime_type, bytes, sha256,
          width, height, duration_s, provenance, lineage)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb) returning *`,
      [a.runId, a.stage, a.kind, a.storageKey, a.storageDriver, a.mimeType ?? null,
       a.bytes ?? null, a.sha256 ?? null, a.width ?? null, a.height ?? null,
       a.durationS ?? null, JSON.stringify(a.provenance ?? null), JSON.stringify(a.lineage ?? null)],
    );
    return rowToArtifact(rows[0]);
  }

  async listArtifacts(runId: string) {
    const { rows } = await this.pool.query(
      `select * from autopilot_artifacts where run_id=$1 order by id`, [runId]);
    return rows.map(rowToArtifact);
  }

  async appendEvent(e: Omit<RunEvent, "seq" | "createdAt">) {
    const { rows } = await this.pool.query(
      `insert into autopilot_events (run_id, seq, level, stage, message, data)
       values ($1,
               (select coalesce(max(seq),0)+1 from autopilot_events where run_id=$1),
               $2,$3,$4,$5::jsonb)
       returning *`,
      [e.runId, e.level, e.stage ?? null, e.message, JSON.stringify(e.data ?? null)]);
    return rowToEvent(rows[0]);
  }

  async listEvents(runId: string, sinceSeq = 0) {
    const { rows } = await this.pool.query(
      `select * from autopilot_events where run_id=$1 and seq>$2 order by seq`, [runId, sinceSeq]);
    return rows.map(rowToEvent);
  }

  async saveCandidates(runId: string, cs: TopicCandidate[]) {
    for (const c of cs) {
      await this.pool.query(
        `insert into topic_candidates
           (run_id, title, angle, category, source, evidence, scores, penalties, total_score, chosen, reject_reason)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)`,
        [runId, c.title, c.angle ?? null, c.category ?? null, c.source,
         JSON.stringify(c.evidence ?? null), JSON.stringify(c.scores ?? {}),
         JSON.stringify(c.penalties ?? {}), c.totalScore, c.chosen, c.rejectReason ?? null]);
    }
  }

  async listCandidates(runId: string) {
    const { rows } = await this.pool.query(
      `select * from topic_candidates where run_id=$1 order by total_score desc`, [runId]);
    return rows.map((r: any): TopicCandidate => ({
      runId: r.run_id, title: r.title, angle: r.angle, category: r.category, source: r.source,
      evidence: r.evidence, scores: r.scores, penalties: r.penalties,
      totalScore: Number(r.total_score), chosen: r.chosen, rejectReason: r.reject_reason,
    }));
  }

  async saveClaims(runId: string, cs: Claim[]) {
    for (const c of cs) {
      await this.pool.query(
        `insert into autopilot_claims
           (run_id, claim, source_url, source_type, excerpt, status, required_qualifier,
            visual_implication, uncertainty)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [runId, c.claim, c.sourceUrl ?? null, c.sourceType ?? null, c.excerpt ?? null,
         c.status, c.requiredQualifier ?? null, c.visualImplication ?? null, c.uncertainty ?? null]);
    }
  }

  async listClaims(runId: string) {
    const { rows } = await this.pool.query(
      `select * from autopilot_claims where run_id=$1 order by id`, [runId]);
    return rows.map((r: any): Claim => ({
      runId: r.run_id, claim: r.claim, sourceUrl: r.source_url, sourceType: r.source_type,
      excerpt: r.excerpt, status: r.status, requiredQualifier: r.required_qualifier,
      visualImplication: r.visual_implication, uncertainty: r.uncertainty,
    }));
  }
}

// ---- row mappers (snake_case -> camelCase, matching the repo convention) ----
const ts = (v: unknown) => (v instanceof Date ? v.getTime() : v ? Number(new Date(v as string)) : null);

function rowToRun(r: any): Run {
  return {
    id: r.id, idempotencyKey: r.idempotency_key, state: r.state,
    config: r.config, topicId: r.topic_id, topicTitle: r.topic_title,
    budgetUsd: Number(r.budget_usd), spentUsd: Number(r.spent_usd),
    dryRun: r.dry_run, correctionPasses: r.correction_passes,
    blockerCode: r.blocker_code, blockerDetail: r.blocker_detail, error: r.error,
    cancelRequested: r.cancel_requested, pauseRequested: r.pause_requested,
    createdAt: ts(r.created_at)!, updatedAt: ts(r.updated_at)!,
    startedAt: ts(r.started_at), finishedAt: ts(r.finished_at),
  };
}

function rowToStage(r: any): StageRow {
  return {
    runId: r.run_id, stage: r.stage, status: r.status, attempt: r.attempt,
    leaseOwner: r.lease_owner, leaseExpiresAt: ts(r.lease_expires_at),
    heartbeatAt: ts(r.heartbeat_at), output: r.output, error: r.error,
    startedAt: ts(r.started_at), finishedAt: ts(r.finished_at),
  };
}

function rowToCall(r: any): ProviderCall {
  return {
    id: r.id, runId: r.run_id, stage: r.stage, provider: r.provider, model: r.model,
    dedupeKey: r.dedupe_key, operationId: r.operation_id, status: r.status,
    attempt: r.attempt, prompt: r.prompt, reason: r.reason,
    estimatedUsd: Number(r.estimated_usd),
    actualUsd: r.actual_usd == null ? null : Number(r.actual_usd),
    responseMeta: r.response_meta, verdict: r.verdict, createdAt: ts(r.created_at)!,
  };
}

function rowToArtifact(r: any): Artifact {
  return {
    id: r.id, runId: r.run_id, stage: r.stage, kind: r.kind, storageKey: r.storage_key,
    storageDriver: r.storage_driver, mimeType: r.mime_type,
    bytes: r.bytes == null ? null : Number(r.bytes), sha256: r.sha256,
    width: r.width, height: r.height,
    durationS: r.duration_s == null ? null : Number(r.duration_s),
    provenance: r.provenance, lineage: r.lineage, createdAt: ts(r.created_at)!,
  };
}

function rowToEvent(r: any): RunEvent {
  return {
    runId: r.run_id, seq: Number(r.seq), level: r.level, stage: r.stage,
    message: r.message, data: r.data, createdAt: ts(r.created_at)!,
  };
}
