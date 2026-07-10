// The learning loop: analytics -> patterns -> new prompt rules -> better next
// batch. Improvement happens through prompt_rules + examples, NOT fine-tuning —
// fine-tuning only makes sense after 300+ performance-labeled examples exist,
// and every generation is already being recorded toward that dataset.

import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { LearningRule, LearningRun, PerformanceMetrics, Video } from "./types.js";
import { learningSystemPrompt, PROMPT_VERSIONS, SEED_RULES } from "./prompts.js";
import { makeId } from "./config.js";

export const MIN_VIDEOS_FOR_LEARNING = 5;

export class LearningDataError extends Error {}

export const LEARNING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "top_patterns", "weak_patterns", "hook_formulas", "recommended_topics",
    "caption_recommendations", "best_length_seconds", "best_categories", "best_tone", "new_rules",
  ],
  properties: {
    top_patterns: { type: "array", items: { type: "string" } },
    weak_patterns: { type: "array", items: { type: "string" } },
    hook_formulas: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 12 },
    recommended_topics: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 25 },
    caption_recommendations: { type: "array", items: { type: "string" } },
    best_length_seconds: { type: "number" },
    best_categories: { type: "array", items: { type: "string" } },
    best_tone: { type: "string" },
    new_rules: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "rule"],
        properties: {
          category: { type: "string", enum: ["hook", "caption", "topic", "structure", "tone", "length"] },
          rule: { type: "string" },
        },
      },
    },
  },
} as const;

/** Composite engagement: completion carries the most signal, saves > shares > likes. */
export function engagementScore(m: PerformanceMetrics): number {
  const views = Math.max(m.views, 1);
  const interaction = ((m.likes + 2 * m.shares + 3 * m.saves) / views) * 100;
  return m.completionRate * 100 + interaction;
}

/** Idempotently install the seed content rules (called at server boot). */
export async function ensureSeedRules(repo: Repo): Promise<void> {
  const existing = await repo.listRules();
  if (existing.some((r) => r.source === "seed")) return;
  for (const s of SEED_RULES) {
    await repo.addRule({
      id: makeId("rule"),
      category: s.category,
      rule: s.rule,
      source: "seed",
      active: true,
      createdAt: Date.now(),
    });
  }
}

export async function runLearning(repo: Repo, llm: LlmClient): Promise<LearningRun> {
  // Latest metrics row per video wins (re-ingestion updates the picture).
  const metrics = await repo.listMetrics();
  const latest = new Map<string, PerformanceMetrics>();
  for (const m of [...metrics].sort((a, b) => a.ingestedAt - b.ingestedAt)) latest.set(m.videoId, m);

  const videos = await repo.listVideos();
  const scored = videos
    .filter((v): v is Video & { pkg: NonNullable<Video["pkg"]> } => !!v.pkg && latest.has(v.id))
    .map((v) => ({ video: v, metrics: latest.get(v.id)!, score: engagementScore(latest.get(v.id)!) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length < MIN_VIDEOS_FOR_LEARNING) {
    throw new LearningDataError(
      `need >=${MIN_VIDEOS_FOR_LEARNING} videos with performance data, have ${scored.length}`,
    );
  }

  const bucket = Math.max(1, Math.ceil(scored.length * 0.2));
  const top = scored.slice(0, bucket);
  const bottom = scored.slice(-bucket);

  const describe = (s: (typeof scored)[number]) => ({
    video_id: s.video.id,
    hook: s.video.pkg.selectedHook,
    category: s.video.pkg.category,
    length_seconds: s.video.pkg.estimatedLengthSeconds,
    caption_lines: s.video.pkg.captionLines.length,
    avg_caption_words: avgWords(s.video.pkg.captionLines.map((l) => l.text)),
    platform: s.metrics.platform,
    views: s.metrics.views,
    completion_rate: s.metrics.completionRate,
    avg_watch_time: s.metrics.avgWatchTime,
    saves: s.metrics.saves,
    shares: s.metrics.shares,
    likes: s.metrics.likes,
    engagement_score: Math.round(s.score * 10) / 10,
  });

  const system = learningSystemPrompt();
  const user = `Weekly performance analysis (${scored.length} videos).\n\n${JSON.stringify(
    { top_videos: top.map(describe), bottom_videos: bottom.map(describe) },
    null,
    2,
  )}`;

  const raw: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_learning_analysis",
    schema: LEARNING_SCHEMA as unknown as Record<string, unknown>,
    purpose: "learning",
  });

  const runId = makeId("learn");

  // New rules supersede the previous learning run's rules (seed + manual stay).
  const prior = await repo.listRules();
  for (const r of prior) {
    if (r.source === "learning_run" && r.active) {
      r.active = false;
      await repo.updateRule(r);
    }
  }
  const newRuleIds: string[] = [];
  for (const nr of raw.new_rules ?? []) {
    const rule: LearningRule = {
      id: makeId("rule"),
      category: nr.category,
      rule: String(nr.rule),
      source: "learning_run",
      active: true,
      runId,
      createdAt: Date.now(),
    };
    await repo.addRule(rule);
    newRuleIds.push(rule.id);
  }

  const run: LearningRun = {
    id: runId,
    analyzedVideos: scored.length,
    topPatterns: strArr(raw.top_patterns),
    weakPatterns: strArr(raw.weak_patterns),
    hookFormulas: strArr(raw.hook_formulas),
    recommendedTopics: strArr(raw.recommended_topics),
    captionRecommendations: strArr(raw.caption_recommendations),
    bestLengthSeconds: Number(raw.best_length_seconds) || undefined,
    bestCategories: strArr(raw.best_categories),
    bestTone: raw.best_tone ? String(raw.best_tone) : undefined,
    newRuleIds,
    promptVersion: PROMPT_VERSIONS.learning,
    model: llm.model,
    createdAt: Date.now(),
  };
  await repo.addLearningRun(run);
  await repo.addGeneration({
    id: makeId("gen"),
    videoId: runId, // learning runs aren't tied to one video; keyed by run id
    kind: "learning",
    promptVersion: PROMPT_VERSIONS.learning,
    model: llm.model,
    input: { system, user },
    output: raw,
    createdAt: Date.now(),
  });
  return run;
}

function avgWords(lines: string[]): number {
  if (!lines.length) return 0;
  const total = lines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  return Math.round((total / lines.length) * 10) / 10;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
