// Minimal in-process job queue: serialized background work (generation, learning)
// without requiring Redis for a single-admin tool. The interface is deliberately
// BullMQ-shaped (named jobs + payloads) so a Redis-backed swap is mechanical.

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: number;
  kind: string;
  payload: unknown;
  status: JobStatus;
  error?: string;
  enqueuedAt: number;
  finishedAt?: number;
}

type Handler = (payload: any) => Promise<void>;

export class JobQueue {
  private jobs: Job[] = [];
  private pending: Job[] = [];
  private running = false;
  private seq = 0;
  private idle: Array<() => void> = [];

  constructor(private handlers: Record<string, Handler>) {}

  enqueue(kind: string, payload: unknown): Job {
    if (!this.handlers[kind]) throw new Error(`no handler for job kind: ${kind}`);
    const job: Job = {
      id: ++this.seq, kind, payload, status: "queued", enqueuedAt: Date.now(),
    };
    this.jobs.push(job);
    this.pending.push(job);
    void this.pump();
    return job;
  }

  list(): Job[] {
    return [...this.jobs].sort((a, b) => b.id - a.id).slice(0, 100);
  }

  /** Resolves when the queue is fully drained — used by tests and shutdown. */
  drain(): Promise<void> {
    if (!this.running && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let job: Job | undefined;
      while ((job = this.pending.shift())) {
        job.status = "running";
        try {
          await this.handlers[job.kind](job.payload);
          job.status = "done";
        } catch (e) {
          // A failed job must not kill the worker loop; the video row carries
          // its own failed status + error for the dashboard.
          job.status = "failed";
          job.error = e instanceof Error ? e.message : String(e);
          console.error(`[queue] job ${job.id} (${job.kind}) failed:`, job.error);
        }
        job.finishedAt = Date.now();
      }
    } finally {
      this.running = false;
      const waiters = this.idle.splice(0);
      for (const w of waiters) w();
    }
  }
}
