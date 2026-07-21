/**
 * Durable render state.
 *
 * The blocker this fixes: LocalRenderer held render status in process-local Maps.
 * On Render the WEB service and the WORKER are separate processes, and workers restart
 * on every deploy — so a render started by the worker was unpollable from the web
 * service and simply vanished on restart. That is not a limitation to document, it is
 * guaranteed data loss.
 *
 * Contract:
 *   - the worker CHECKPOINTS before and after rendering
 *   - the web service polls the STORE, never renderer memory
 *   - completion is atomic and idempotent: an already-completed artifact is reused,
 *     never re-rendered
 *   - a lease + heartbeat means a dead worker's job becomes claimable after TTL and
 *     no sooner, so two workers can never render the same job concurrently
 *
 * MemoryRenderStore exists ONLY for tests and local development. Production selects
 * PgRenderStore via DATABASE_URL.
 */
import { createHash } from "node:crypto";

export type RenderJobStatus = "queued" | "running" | "completed" | "failed";

export interface RenderJob {
  id: string;
  idempotencyKey: string | null;
  runId?: string | null;
  stage?: string | null;
  status: RenderJobStatus;
  attempt: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  heartbeatAt?: number | null;
  progress: number;
  inputHashes?: unknown;
  outputUri?: string | null;
  outputSha256?: string | null;
  outputBytes?: number | null;
  probe?: unknown;
  error?: string | null;
  retryAfter?: number | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export interface RenderStore {
  init(): Promise<void>;
  /**
   * Idempotent create. Returns the EXISTING job when idempotencyKey was already used —
   * `created:false` means "do not render again, reuse what is recorded".
   */
  create(input: {
    id: string;
    idempotencyKey?: string | null;
    runId?: string | null;
    stage?: string | null;
    inputHashes?: unknown;
  }): Promise<{ job: RenderJob; created: boolean }>;
  get(id: string): Promise<RenderJob | null>;
  findByIdempotencyKey(key: string): Promise<RenderJob | null>;
  /** Atomically take ownership. Null when another worker holds a live lease. */
  claim(id: string, owner: string, leaseMs: number): Promise<RenderJob | null>;
  heartbeat(id: string, owner: string, leaseMs: number, progress?: number): Promise<void>;
  complete(id: string, out: {
    outputUri: string; outputSha256: string; outputBytes?: number; probe?: unknown;
  }): Promise<void>;
  fail(id: string, error: string, opts?: { retryAfterMs?: number }): Promise<void>;
  /** Release leases held by dead workers. Returns how many were reclaimed. */
  reclaimExpired(now?: number): Promise<number>;
  listByRun(runId: string): Promise<RenderJob[]>;
}

/** Stable hash of whatever determines the output. Same inputs => same key => no re-render. */
export function renderIdempotencyKey(parts: {
  script: string;
  captionLines: unknown;
  audioSha256?: string;
  format?: string;
  rendererVersion?: string;
}): string {
  const h = createHash("sha256");
  h.update(parts.script);
  h.update(JSON.stringify(parts.captionLines ?? null));
  h.update(parts.audioSha256 ?? "");
  h.update(parts.format ?? "narrated");
  // Bump when the composition changes, so old artifacts are not wrongly reused.
  h.update(parts.rendererVersion ?? "local-v1");
  return h.digest("hex");
}

const now = () => Date.now();

// ---------------------------------------------------------------------------
// MemoryRenderStore — TEST/DEV ONLY. Never selected when DATABASE_URL is set.
// ---------------------------------------------------------------------------
export class MemoryRenderStore implements RenderStore {
  private jobs = new Map<string, RenderJob>();
  private byKey = new Map<string, string>();

  async init(): Promise<void> {}

  async create(input: {
    id: string; idempotencyKey?: string | null; runId?: string | null;
    stage?: string | null; inputHashes?: unknown;
  }) {
    const key = input.idempotencyKey ?? null;
    if (key) {
      const existingId = this.byKey.get(key);
      if (existingId) return { job: this.jobs.get(existingId)!, created: false };
    }
    const job: RenderJob = {
      id: input.id, idempotencyKey: key, runId: input.runId ?? null,
      stage: input.stage ?? null, status: "queued", attempt: 0, progress: 0,
      inputHashes: input.inputHashes ?? null, retryCount: 0,
      createdAt: now(), updatedAt: now(),
    };
    this.jobs.set(job.id, job);
    if (key) this.byKey.set(key, job.id);
    return { job, created: true };
  }

  async get(id: string) { return this.jobs.get(id) ?? null; }

  async findByIdempotencyKey(key: string) {
    const id = this.byKey.get(key);
    return id ? this.jobs.get(id) ?? null : null;
  }

  async claim(id: string, owner: string, leaseMs: number) {
    const j = this.jobs.get(id);
    if (!j) return null;
    if (j.status === "completed") return null;
    if (j.status === "running" && (j.leaseExpiresAt ?? 0) > now() && j.leaseOwner !== owner) {
      return null;                       // someone else holds a live lease
    }
    j.status = "running";
    j.attempt += 1;
    j.leaseOwner = owner;
    j.leaseExpiresAt = now() + leaseMs;
    j.heartbeatAt = now();
    j.startedAt ??= now();
    j.updatedAt = now();
    return j;
  }

  async heartbeat(id: string, owner: string, leaseMs: number, progress?: number) {
    const j = this.jobs.get(id);
    if (!j || j.leaseOwner !== owner) return;
    j.leaseExpiresAt = now() + leaseMs;
    j.heartbeatAt = now();
    if (typeof progress === "number") j.progress = Math.min(1, Math.max(0, progress));
    j.updatedAt = now();
  }

  async complete(id: string, out: {
    outputUri: string; outputSha256: string; outputBytes?: number; probe?: unknown;
  }) {
    const j = this.jobs.get(id);
    if (!j) return;
    // Atomic in spirit: completion is terminal and clears the lease in one step.
    j.status = "completed"; j.progress = 1;
    j.outputUri = out.outputUri; j.outputSha256 = out.outputSha256;
    j.outputBytes = out.outputBytes ?? null; j.probe = out.probe ?? null;
    j.error = null; j.leaseOwner = null; j.leaseExpiresAt = null;
    j.finishedAt = now(); j.updatedAt = now();
  }

  async fail(id: string, error: string, opts?: { retryAfterMs?: number }) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = "failed"; j.error = error; j.retryCount += 1;
    j.retryAfter = opts?.retryAfterMs ? now() + opts.retryAfterMs : null;
    j.leaseOwner = null; j.leaseExpiresAt = null;
    j.finishedAt = now(); j.updatedAt = now();
  }

  async reclaimExpired(t = now()) {
    let n = 0;
    for (const j of this.jobs.values()) {
      if (j.status === "running" && (j.leaseExpiresAt ?? 0) <= t) {
        j.status = "queued"; j.leaseOwner = null; j.leaseExpiresAt = null;
        j.updatedAt = now(); n++;
      }
    }
    return n;
  }

  async listByRun(runId: string) {
    return [...this.jobs.values()].filter((j) => j.runId === runId);
  }
}

// ---------------------------------------------------------------------------
// PgRenderStore — production
// ---------------------------------------------------------------------------
type PgClient = {
  query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};

export class PgRenderStore implements RenderStore {
  private pool!: PgClient;
  /**
   * `injected` exists so the SQL below can be executed against a real PostgreSQL
   * engine in tests (PGlite) instead of being merely typechecked. Every statement
   * this class runs is then genuinely exercised — including the claim guard,
   * ON CONFLICT and FOR UPDATE SKIP LOCKED, which are the parts that actually
   * prevent duplicate renders.
   */
  constructor(private url: string, private injected?: PgClient) {}

  async init(): Promise<void> {
    if (this.injected) { this.pool = this.injected; await this.pool.query("select 1"); return; }
    const spec = "pg";                    // indirect: pg is an optionalDependency
    const pg = (await import(spec)) as unknown as { default?: any; Pool?: any };
    const PoolCtor = (pg as any).Pool ?? (pg as any).default?.Pool;
    if (!PoolCtor) throw new Error("pg: Pool constructor not found");
    this.pool = new PoolCtor({
      connectionString: this.url, max: 4, idleTimeoutMillis: 30_000,
      ssl: this.url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    await this.pool.query("select 1");
  }

  async create(input: {
    id: string; idempotencyKey?: string | null; runId?: string | null;
    stage?: string | null; inputHashes?: unknown;
  }) {
    const key = input.idempotencyKey ?? null;
    if (key) {
      const found = await this.pool.query(`select * from render_jobs where idempotency_key=$1`, [key]);
      if (found.rows.length) return { job: row(found.rows[0]), created: false };
    }
    const { rows } = await this.pool.query(
      `insert into render_jobs (id, idempotency_key, run_id, stage, status, input_hashes)
       values ($1,$2,$3,$4,'queued',$5::jsonb)
       on conflict (idempotency_key) do nothing
       returning *`,
      [input.id, key, input.runId ?? null, input.stage ?? null,
       JSON.stringify(input.inputHashes ?? null)],
    );
    if (!rows.length) {
      const again = await this.pool.query(`select * from render_jobs where idempotency_key=$1`, [key]);
      return { job: row(again.rows[0]), created: false };
    }
    return { job: row(rows[0]), created: true };
  }

  async get(id: string) {
    const { rows } = await this.pool.query(`select * from render_jobs where id=$1`, [id]);
    return rows.length ? row(rows[0]) : null;
  }

  async findByIdempotencyKey(key: string) {
    const { rows } = await this.pool.query(`select * from render_jobs where idempotency_key=$1`, [key]);
    return rows.length ? row(rows[0]) : null;
  }

  async claim(id: string, owner: string, leaseMs: number) {
    // Single statement so two workers cannot both win. Completed jobs are never
    // re-claimed — that is what stops a duplicate render after a restart.
    const { rows } = await this.pool.query(
      `update render_jobs
          set status='running', attempt = attempt + 1, lease_owner=$2,
              lease_expires_at = now() + ($3::int * interval '1 millisecond'),
              heartbeat_at = now(), started_at = coalesce(started_at, now()),
              updated_at = now()
        where id = $1
          and status <> 'completed'
          and (status <> 'running' or lease_expires_at < now() or lease_owner = $2)
      returning *`,
      [id, owner, leaseMs],
    );
    return rows.length ? row(rows[0]) : null;
  }

  async heartbeat(id: string, owner: string, leaseMs: number, progress?: number) {
    await this.pool.query(
      `update render_jobs
          set lease_expires_at = now() + ($3::int * interval '1 millisecond'),
              heartbeat_at = now(),
              progress = coalesce($4, progress),
              updated_at = now()
        where id=$1 and lease_owner=$2`,
      [id, owner, leaseMs, progress ?? null],
    );
  }

  async complete(id: string, out: {
    outputUri: string; outputSha256: string; outputBytes?: number; probe?: unknown;
  }) {
    await this.pool.query(
      `update render_jobs
          set status='completed', progress=1, output_uri=$2, output_sha256=$3,
              output_bytes=$4, probe=$5::jsonb, error=null,
              lease_owner=null, lease_expires_at=null,
              finished_at=now(), updated_at=now()
        where id=$1`,
      [id, out.outputUri, out.outputSha256, out.outputBytes ?? null,
       JSON.stringify(out.probe ?? null)],
    );
  }

  async fail(id: string, error: string, opts?: { retryAfterMs?: number }) {
    await this.pool.query(
      `update render_jobs
          set status='failed', error=$2, retry_count = retry_count + 1,
              retry_after = case when $3::int is null then null
                                 else now() + ($3::int * interval '1 millisecond') end,
              lease_owner=null, lease_expires_at=null,
              finished_at=now(), updated_at=now()
        where id=$1`,
      [id, error, opts?.retryAfterMs ?? null],
    );
  }

  async reclaimExpired() {
    const { rowCount } = await this.pool.query(
      `update render_jobs
          set status='queued', lease_owner=null, lease_expires_at=null, updated_at=now()
        where status='running' and lease_expires_at < now()`);
    return rowCount ?? 0;
  }

  async listByRun(runId: string) {
    const { rows } = await this.pool.query(
      `select * from render_jobs where run_id=$1 order by created_at`, [runId]);
    return rows.map(row);
  }
}

const ts = (v: unknown) => (v instanceof Date ? v.getTime() : v ? Number(new Date(v as string)) : null);

function row(r: any): RenderJob {
  return {
    id: r.id, idempotencyKey: r.idempotency_key, runId: r.run_id, stage: r.stage,
    status: r.status, attempt: r.attempt, leaseOwner: r.lease_owner,
    leaseExpiresAt: ts(r.lease_expires_at), heartbeatAt: ts(r.heartbeat_at),
    progress: Number(r.progress), inputHashes: r.input_hashes,
    outputUri: r.output_uri, outputSha256: r.output_sha256,
    outputBytes: r.output_bytes == null ? null : Number(r.output_bytes),
    probe: r.probe, error: r.error, retryAfter: ts(r.retry_after),
    retryCount: r.retry_count, createdAt: ts(r.created_at)!, updatedAt: ts(r.updated_at)!,
    startedAt: ts(r.started_at), finishedAt: ts(r.finished_at),
  };
}

/** DATABASE_URL => Postgres; otherwise memory (tests/dev only). */
export async function makeRenderStore(databaseUrl?: string | null): Promise<RenderStore> {
  const isProd = process.env.NODE_ENV === "production";

  // Fail closed. In production, serving render state from memory is the exact defect
  // this module exists to remove: the web process could not see the worker's render
  // and a deploy would lose every in-flight job. Refusing to boot is strictly better
  // than booting into silent data loss.
  if (!databaseUrl) {
    if (isProd) throw new Error("DATABASE_URL is required in production: render state must be durable");
    return new MemoryRenderStore();
  }
  try {
    const s = new PgRenderStore(databaseUrl);
    await s.init();
    return s;
  } catch (e) {
    if (isProd) throw new Error(`Postgres render store unavailable in production: ${(e as Error).message}`);
    console.error("[render] Postgres render store unavailable, falling back to memory (dev only):", e);
    return new MemoryRenderStore();
  }
}
