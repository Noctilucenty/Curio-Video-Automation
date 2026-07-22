// Repository abstraction (same pattern as curio's server: async everywhere so a
// Postgres adapter can swap in without touching callers — schema in db/schema.sql).
// InMemoryRepo powers tests; JsonFileRepo adds a debounced snapshot to disk so
// dev state survives restarts without needing a database.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Topic, Video, GenerationRecord, PerformanceMetrics, LearningRule, LearningRun, ProductionGate,
} from "./types.js";

export interface Repo {
  createTopic(t: Topic): Promise<Topic>;
  getTopic(id: string): Promise<Topic | null>;
  listTopics(): Promise<Topic[]>;
  updateTopic(t: Topic): Promise<Topic>;

  createVideo(v: Video): Promise<Video>;
  getVideo(id: string): Promise<Video | null>;
  updateVideo(v: Video): Promise<Video>;
  listVideos(): Promise<Video[]>;

  addGeneration(g: GenerationRecord): Promise<void>;
  listGenerations(videoId?: string): Promise<GenerationRecord[]>;

  addMetrics(m: PerformanceMetrics): Promise<void>;
  listMetrics(videoId?: string): Promise<PerformanceMetrics[]>;

  addRule(r: LearningRule): Promise<void>;
  updateRule(r: LearningRule): Promise<void>;
  listRules(activeOnly?: boolean): Promise<LearningRule[]>;

  addLearningRun(r: LearningRun): Promise<void>;
  listLearningRuns(): Promise<LearningRun[]>;

  createProductionGate(g: ProductionGate): Promise<ProductionGate>;
  getProductionGate(id: string): Promise<ProductionGate | null>;
  getProductionGateByKey(key: string): Promise<ProductionGate | null>;
  updateProductionGate(g: ProductionGate): Promise<ProductionGate>;
  listProductionGates(): Promise<ProductionGate[]>;
}

interface Snapshot {
  topics: Topic[];
  videos: Video[];
  generations: GenerationRecord[];
  metrics: PerformanceMetrics[];
  rules: LearningRule[];
  learningRuns: LearningRun[];
  productionGates?: ProductionGate[];
}

export class InMemoryRepo implements Repo {
  protected topics = new Map<string, Topic>();
  protected videos = new Map<string, Video>();
  protected generations: GenerationRecord[] = [];
  protected metrics: PerformanceMetrics[] = [];
  protected rules = new Map<string, LearningRule>();
  protected learningRuns: LearningRun[] = [];
  protected productionGates = new Map<string, ProductionGate>();

  /** Hook for persistent subclasses; no-op in memory. */
  protected persist(): void {}

  async createTopic(t: Topic): Promise<Topic> {
    this.topics.set(t.id, t); this.persist(); return t;
  }
  async getTopic(id: string): Promise<Topic | null> {
    return this.topics.get(id) ?? null;
  }
  async listTopics(): Promise<Topic[]> {
    return [...this.topics.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  async updateTopic(t: Topic): Promise<Topic> {
    this.topics.set(t.id, t); this.persist(); return t;
  }

  async createVideo(v: Video): Promise<Video> {
    this.videos.set(v.id, v); this.persist(); return v;
  }
  async getVideo(id: string): Promise<Video | null> {
    return this.videos.get(id) ?? null;
  }
  async updateVideo(v: Video): Promise<Video> {
    v.updatedAt = Date.now();
    this.videos.set(v.id, v); this.persist(); return v;
  }
  async listVideos(): Promise<Video[]> {
    return [...this.videos.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async addGeneration(g: GenerationRecord): Promise<void> {
    this.generations.push(g); this.persist();
  }
  async listGenerations(videoId?: string): Promise<GenerationRecord[]> {
    return videoId ? this.generations.filter((g) => g.videoId === videoId) : [...this.generations];
  }

  async addMetrics(m: PerformanceMetrics): Promise<void> {
    this.metrics.push(m); this.persist();
  }
  async listMetrics(videoId?: string): Promise<PerformanceMetrics[]> {
    return videoId ? this.metrics.filter((m) => m.videoId === videoId) : [...this.metrics];
  }

  async addRule(r: LearningRule): Promise<void> {
    this.rules.set(r.id, r); this.persist();
  }
  async updateRule(r: LearningRule): Promise<void> {
    this.rules.set(r.id, r); this.persist();
  }
  async listRules(activeOnly = false): Promise<LearningRule[]> {
    const all = [...this.rules.values()].sort((a, b) => a.createdAt - b.createdAt);
    return activeOnly ? all.filter((r) => r.active) : all;
  }

  async addLearningRun(r: LearningRun): Promise<void> {
    this.learningRuns.push(r); this.persist();
  }
  async listLearningRuns(): Promise<LearningRun[]> {
    return [...this.learningRuns].sort((a, b) => b.createdAt - a.createdAt);
  }

  async createProductionGate(g: ProductionGate): Promise<ProductionGate> {
    this.productionGates.set(g.id, g); this.persist(); return g;
  }
  async getProductionGate(id: string): Promise<ProductionGate | null> {
    return this.productionGates.get(id) ?? null;
  }
  async getProductionGateByKey(key: string): Promise<ProductionGate | null> {
    return [...this.productionGates.values()].find((g) => g.key === key) ?? null;
  }
  async updateProductionGate(g: ProductionGate): Promise<ProductionGate> {
    this.productionGates.set(g.id, g); this.persist(); return g;
  }
  async listProductionGates(): Promise<ProductionGate[]> {
    return [...this.productionGates.values()].sort((a, b) => b.requestedAt - a.requestedAt);
  }
}

/**
 * Dev persistence: whole-state JSON snapshot, debounced to one write per 250ms
 * burst. Fine for a single-admin tool; the Postgres adapter replaces this for
 * real multi-writer deployments.
 */
export class JsonFileRepo extends InMemoryRepo {
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    super();
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "automation.json");
    if (existsSync(this.file)) {
      try {
        const snap = JSON.parse(readFileSync(this.file, "utf8")) as Snapshot;
        for (const t of snap.topics ?? []) this.topics.set(t.id, t);
        for (const v of snap.videos ?? []) this.videos.set(v.id, v);
        this.generations = snap.generations ?? [];
        this.metrics = snap.metrics ?? [];
        for (const r of snap.rules ?? []) this.rules.set(r.id, r);
        this.learningRuns = snap.learningRuns ?? [];
        for (const g of snap.productionGates ?? []) this.productionGates.set(g.id, g);
      } catch (e) {
        // A corrupt snapshot must not brick the server; start fresh but loudly.
        console.error(`[repo] could not parse ${this.file}, starting empty:`, e);
      }
    }
  }

  protected override persist(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 250);
    this.timer.unref?.();
  }

  flush(): void {
    const snap: Snapshot = {
      topics: [...this.topics.values()],
      videos: [...this.videos.values()],
      generations: this.generations,
      metrics: this.metrics,
      rules: [...this.rules.values()],
      learningRuns: this.learningRuns,
      productionGates: [...this.productionGates.values()],
    };
    writeFileSync(this.file, JSON.stringify(snap, null, 2));
  }
}
