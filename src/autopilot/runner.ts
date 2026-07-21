/**
 * The stage runner. This is the piece that makes a production survive a deploy.
 *
 * Contract per tick:
 *   1. reclaim leases from dead workers
 *   2. claim ONE stage under a lease
 *   3. enforce cancel / pause / budget BEFORE doing anything expensive
 *   4. run the stage handler with a heartbeat keeping the lease alive
 *   5. persist the outcome, advance the run state
 *
 * Nothing here calls a provider directly. Stage handlers do, and they must go through
 * `ctx.spend()` so every paid call is deduped, budgeted and recorded.
 */
import { randomUUID } from "node:crypto";
import { BLOCKER_HELP, firstStage, nextStage, type Stage } from "./states.js";
import type { AutopilotStore } from "./store.js";
import { BlockedError, type ProviderCall, type Run } from "./types.js";

export const LEASE_MS = 60_000;
const HEARTBEAT_MS = 15_000;

export interface StageContext {
  run: Run;
  stage: Stage;
  attempt: number;
  store: AutopilotStore;
  log(message: string, data?: unknown, level?: "info" | "warn" | "error"): Promise<void>;
  /**
   * The ONLY sanctioned way to make a paid provider call.
   *
   * - refuses in dry-run
   * - refuses when the projected total would exceed the run budget (BLOCKED_BUDGET)
   * - dedupes on `key`: if this key already ran, the recorded result is returned and
   *   the provider is NOT called again. This is what makes a restart free.
   */
  spend<T>(opts: {
    key: string;
    provider: string;
    model?: string;
    estimatedUsd: number;
    reason: string;
    prompt?: string;
    run: (recordOperationId: (id: string) => Promise<void>) => Promise<T>;
  }): Promise<T>;
  /** Previously completed stage outputs, keyed by stage name. */
  outputs: Record<string, unknown>;
}

export type StageHandler = (ctx: StageContext) => Promise<unknown>;
export type StageRegistry = Partial<Record<Stage, StageHandler>>;

export interface RunnerDeps {
  store: AutopilotStore;
  stages: StageRegistry;
  workerId?: string;
}

export class Runner {
  private workerId: string;

  constructor(private deps: RunnerDeps) {
    this.workerId = deps.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Advance a run by at most one stage. Returns true if there is more work, so the
   * worker loop can keep pumping this run without re-polling the queue.
   */
  async tick(runId: string): Promise<boolean> {
    const { store, stages } = this.deps;
    await store.reclaimExpired();

    const run0 = await store.getRun(runId);
    if (!run0) return false;

    // Control flags win over everything, checked BETWEEN stages so a cancel never
    // interrupts a half-finished paid call.
    if (run0.cancelRequested) {
      await this.settle(runId, "CANCELLED", "cancelled by operator");
      return false;
    }
    if (run0.pauseRequested) {
      await store.updateRun(runId, { state: "PAUSED" });
      return false;
    }
    if (["READY_FOR_REVIEW", "CANCELLED", "FAILED"].includes(run0.state)) return false;

    const claimed = await store.claimNextStage(runId, this.workerId, LEASE_MS);
    if (!claimed) {
      // No claimable stage: either another worker holds the lease, or everything is
      // done. Distinguish by checking completion.
      const rows = await store.listStages(runId);
      const allDone = rows.every((r) => r.status === "completed" || r.status === "skipped");
      if (allDone) {
        await store.updateRun(runId, {
          state: "READY_FOR_REVIEW", finishedAt: Date.now(), blockerCode: null,
        });
        await this.log(runId, null, "Run complete — ready for review.");
      }
      return false;
    }

    const { stage, attempt } = claimed;
    const run = claimed.run;

    await store.updateRun(runId, {
      state: stage,
      startedAt: run.startedAt ?? Date.now(),
    });
    await this.log(runId, stage, `Stage started (attempt ${attempt}).`);

    const heart = setInterval(() => {
      void store.heartbeat(runId, stage, this.workerId, LEASE_MS);
    }, HEARTBEAT_MS);
    if (typeof heart.unref === "function") heart.unref();

    try {
      const handler = stages[stage];
      const outputs = await this.collectOutputs(runId);
      const ctx = this.makeContext(run, stage, attempt, outputs);

      const output = handler
        ? await handler(ctx)
        : { note: `no handler registered for ${stage}` };

      await store.completeStage(runId, stage, output ?? null);
      await this.log(runId, stage, "Stage completed.");

      const needsCorrection =
        stage === "CREATIVE_SELF_REVIEW" &&
        !!(output as { needsCorrection?: boolean } | null)?.needsCorrection &&
        run.correctionPasses < run.config.maxCorrectionPasses;

      // Mark a skipped CORRECTING so "all stages accounted for" stays true.
      if (stage === "CREATIVE_SELF_REVIEW" && !needsCorrection) {
        await store.completeStage(runId, "CORRECTING", { skipped: "no_correction_needed" });
      }
      if (stage === "CORRECTING") {
        await store.updateRun(runId, { correctionPasses: run.correctionPasses + 1 });
      }

      const next = nextStage(stage, { needsCorrection });
      if (!next) {
        await store.updateRun(runId, {
          state: "READY_FOR_REVIEW", finishedAt: Date.now(),
        });
        await this.log(runId, null, "Run complete — ready for review.");
        return false;
      }
      return true;
    } catch (e) {
      if (e instanceof BlockedError) {
        // A blocker is NOT a failure: the run parks, keeps all completed stages, and
        // resumes from here once the human clears the cause.
        await store.failStage(runId, stage, e.detail);
        await store.updateRun(runId, {
          state: e.code, blockerCode: e.code, blockerDetail: e.detail,
        });
        await this.log(runId, stage, `${e.code}: ${e.detail}`, { help: BLOCKER_HELP[e.code] }, "warn");
        return false;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await store.failStage(runId, stage, msg);
      await store.updateRun(runId, { state: "FAILED", error: msg, finishedAt: Date.now() });
      await this.log(runId, stage, `Stage failed: ${msg}`, undefined, "error");
      return false;
    } finally {
      clearInterval(heart);
    }
  }

  /** Drive a run to completion or to a stop. Bounded so a bug can't spin forever. */
  async drive(runId: string, maxTicks = 60): Promise<void> {
    for (let i = 0; i < maxTicks; i++) {
      if (!(await this.tick(runId))) return;
    }
  }

  private async collectOutputs(runId: string): Promise<Record<string, unknown>> {
    const rows = await this.deps.store.listStages(runId);
    const out: Record<string, unknown> = {};
    for (const r of rows) if (r.status === "completed") out[r.stage] = r.output;
    return out;
  }

  private makeContext(run: Run, stage: Stage, attempt: number, outputs: Record<string, unknown>): StageContext {
    const store = this.deps.store;
    const log = this.log.bind(this);
    return {
      run, stage, attempt, store, outputs,
      log: (message, data, level = "info") => log(run.id, stage, message, data, level),
      async spend<T>(opts: {
        key: string; provider: string; model?: string; estimatedUsd: number;
        reason: string; prompt?: string;
        run: (recordOperationId: (id: string) => Promise<void>) => Promise<T>;
      }): Promise<T> {
        const fresh = (await store.getRun(run.id))!;
        if (fresh.dryRun) {
          // Simulate: no HTTP, no charge, no provider_calls row. The stage still runs
          // its own logic, so a dry run validates the flow rather than bypassing it.
          await log(run.id, stage, `DRY RUN — simulated ${opts.provider} call (no spend).`);
          return { dryRun: true, provider: opts.provider } as unknown as T;
        }
        const projected = Number(fresh.spentUsd) + opts.estimatedUsd;
        if (projected > Number(fresh.budgetUsd)) {
          throw new BlockedError(
            "BLOCKED_BUDGET",
            `${opts.provider} call would take spend to $${projected.toFixed(2)} of ` +
              `$${Number(fresh.budgetUsd).toFixed(2)}.`,
          );
        }

        const call: Omit<ProviderCall, "id" | "createdAt"> = {
          runId: run.id, stage, provider: opts.provider, model: opts.model ?? null,
          dedupeKey: opts.key, status: "started", attempt,
          prompt: opts.prompt ?? null, reason: opts.reason,
          estimatedUsd: opts.estimatedUsd,
        };
        const { call: rec, created } = await store.recordProviderCall(call);

        // THE duplicate-spend guard. On a restart the key already exists, so we return
        // the recorded result instead of paying again.
        if (!created && rec.status === "succeeded") {
          await log(run.id, stage, `Reusing prior ${opts.provider} result (no re-spend).`);
          return rec.responseMeta as T;
        }

        try {
          const result = await opts.run(async (operationId) => {
            // Persist the provider's own id BEFORE the result exists, so a crash
            // mid-poll can still be reconciled instead of re-submitted.
            await store.finishProviderCall(opts.key, { operationId });
          });
          await store.finishProviderCall(opts.key, {
            status: "succeeded", actualUsd: opts.estimatedUsd, responseMeta: result as unknown,
          });
          await store.updateRun(run.id, { spentUsd: projected });
          return result;
        } catch (err) {
          await store.finishProviderCall(opts.key, {
            status: "failed",
            responseMeta: { error: err instanceof Error ? err.message : String(err) },
          });
          throw err;
        }
      },
    };
  }

  private async log(
    runId: string, stage: Stage | null, message: string,
    data?: unknown, level: "info" | "warn" | "error" = "info",
  ) {
    await this.deps.store.appendEvent({ runId, level, stage, message, data });
    const line = JSON.stringify({ t: new Date().toISOString(), runId, stage, level, message });
    if (level === "error") console.error(line); else console.log(line);
  }

  private async settle(runId: string, state: "CANCELLED" | "FAILED", message: string) {
    await this.deps.store.updateRun(runId, { state, finishedAt: Date.now() });
    await this.log(runId, null, message, undefined, state === "FAILED" ? "error" : "warn");
  }
}

/** Ensure a brand-new run is positioned at the first stage. */
export function initialState(): Stage { return firstStage(); }
