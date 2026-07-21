/**
 * Run queue abstraction.
 *
 * The existing src/queue.ts JobQueue stays exactly as it is — it still serves the
 * generate/finalize_edit/postprocess jobs and its tests. This is a SECOND, narrower
 * queue that only carries run IDs, which is all the worker needs (canonical state
 * lives in Postgres, so the payload is deliberately tiny).
 *
 * Two adapters:
 *   InProcessRunQueue — dev/tests; same process, no services required
 *   BullRunQueue      — production; Render Key Value, survives restarts
 */
export interface RunQueue {
  enqueue(runId: string): Promise<void>;
  /** Register the consumer. Called once by the worker process. */
  process(handler: (runId: string) => Promise<void>): void;
  /** Test helper: resolve when the queue is idle. */
  drain(): Promise<void>;
  close(): Promise<void>;
}

export class InProcessRunQueue implements RunQueue {
  private pending: string[] = [];
  private handler?: (runId: string) => Promise<void>;
  private running = false;
  private idle: Array<() => void> = [];

  async enqueue(runId: string): Promise<void> {
    this.pending.push(runId);
    void this.pump();
  }

  process(handler: (runId: string) => Promise<void>): void {
    this.handler = handler;
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running || !this.handler) return;
    this.running = true;
    try {
      let id: string | undefined;
      while ((id = this.pending.shift())) {
        try {
          await this.handler(id);
        } catch (e) {
          // A failing run must not kill the pump — same contract as JobQueue.
          console.error(`[runqueue] run ${id} failed:`, e);
        }
      }
    } finally {
      this.running = false;
      const waiters = this.idle.splice(0);
      for (const w of waiters) w();
    }
  }

  async drain(): Promise<void> {
    if (!this.running && this.pending.length === 0) return;
    await new Promise<void>((resolve) => this.idle.push(resolve));
  }

  async close(): Promise<void> {}
}

/**
 * BullMQ over Render Key Value.
 *
 * Imported lazily so the package is optional: tests and local dev never need Redis,
 * and a missing dependency degrades to in-process rather than crashing at boot.
 */
export async function makeRunQueue(redisUrl?: string | null): Promise<RunQueue> {
  if (!redisUrl) return new InProcessRunQueue();
  try {
    // Untyped on purpose: bullmq is optional and may not be installed when this
    // file is typechecked. Runtime shape is asserted by the smoke test.
    const spec = "bullmq";
    const bull: any = await import(spec);
    const { Queue, Worker } = bull;
    const connection = {
      url: redisUrl,
      // BullMQ requires this; with any eviction policy Redis can silently drop job
      // keys under memory pressure, losing queued production runs.
      maxRetriesPerRequest: null as null,
    };
    const NAME = "curio-autopilot";
    const queue: any = new Queue(NAME, { connection });

    return {
      async enqueue(runId: string) {
        await queue.add(
          "run",
          { runId },
          {
            // Job id == run id: BullMQ dedupes, so a double-enqueue of the same run
            // cannot produce two concurrent workers for it.
            jobId: runId,
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: 200,
            removeOnFail: 500,
          },
        );
      },
      process(handler) {
        const w: any = new Worker(
          NAME,
          async (job: { data: { runId: string } }) => { await handler(job.data.runId); },
          { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1) },
        );
        w.on("failed", (job: unknown, err: Error) => console.error("[bull] job failed:", err?.message));
      },
      async drain() { await queue.drain(); },
      async close() { await queue.close(); },
    };
  } catch (e) {
    console.error("[autopilot] BullMQ unavailable, using in-process queue:", e);
    return new InProcessRunQueue();
  }
}
