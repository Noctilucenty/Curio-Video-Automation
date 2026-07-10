// The learning loop: analytics -> patterns -> new prompt rules -> better next
// batch. v2 makes it COMPOUND across analytics drops:
//   - history: the LLM sees previous runs and what they recommended
//   - rule_validation: videos generated under each rule vs baseline — rules that
//     worked get re-issued/strengthened, refuted ones get dropped or inverted
//   - judge_vs_actual: where the pre-publish judge mispredicted real performance,
//     a "calibration" rule corrects the judge itself
//   - platform_notes: IG/TikTok/YouTube punish differently; lessons stay separate
// Improvement happens through prompt_rules + examples, NOT fine-tuning — that
// only makes sense after 300+ performance-labeled examples exist, and every
// generation is already being recorded toward that dataset.

import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { LearningRule, LearningRun, PerformanceMetrics, Video } from "./types.js";
import { learningSystemPrompt, PROMPT_VERSIONS, SEED_RULES } from "./prompts.js";
import { makeId } from "./config.js";

export const MIN_VIDEOS_FOR_LEARNING = 5;

export class LearningDataError extends Error {}

const RULE_CATEGORIES = ["hook", "caption", "topic", "structure", "tone", "length", "calibration"] as const;

export const LEARNING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "top_patterns", "weak_patterns", "hook_formulas", "recommended_topics",
    "caption_recommendations", "platform_notes", "judge_calibration_notes",
    "best_length_seconds", "best_categories", "best_tone", "new_rules",
  ],
  properties: {
    top_patterns: { type: "array", items: { type: "string" } },
    weak_patterns: { type: "array", items: { type: "string" } },
    hook_formulas: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 12 },
    recommended_topics: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 25 },
    caption_recommendations: { type: "array", items: { type: "string" } },
    platform_notes: { type: "array", items: { type: "string" } },
    judge_calibration_notes: { type: "array", items: { type: "string" } },
    best_length_seconds: { type: "number" },
    best_categories: { type: "array", items: { type: "string" } },
    best_tone: { type: "string" },
    new_rules: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "rule"],
        properties: {
          category: { type: "string", enum: [...RULE_CATEGORIES] },
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

interface ScoredVideo {
  video: Video & { pkg: NonNullable<Video["pkg"]> };
  metrics: PerformanceMetrics;
  score: number;
}

/** Latest metrics row per video wins (re-sending analytics updates the picture). */
export async function latestMetricsByVideo(repo: Repo): Promise<Map<string, PerformanceMetrics>> {
  const metrics = await repo.listMetrics();
  const latest = new Map<string, PerformanceMetrics>();
  for (const m of [...metrics].sort((a, b) => a.ingestedAt - b.ingestedAt)) latest.set(m.videoId, m);
  return latest;
}

export async function runLearning(repo: Repo, llm: LlmClient): Promise<LearningRun> {
  const latest = await latestMetricsByVideo(repo);
  const videos = await repo.listVideos();
  const scored: ScoredVideo[] = videos
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
  const baselineAvg = avg(scored.map((s) => s.score));

  const priorRuns = await repo.listLearningRuns(); // newest first
  const previousRun = priorRuns[0];
  const allRules = await repo.listRules();

  const payload = {
    current: {
      analyzed: scored.length,
      baseline_avg_engagement: round1(baselineAvg),
      top_videos: top.map((s) => describeVideo(s)),
      bottom_videos: bottom.map((s) => describeVideo(s)),
      platforms: platformAggregates(scored),
    },
    history: priorRuns.slice(0, 3).map((r) => ({
      run_id: r.id,
      created_at: r.createdAt,
      top_patterns: r.topPatterns,
      platform_notes: r.platformNotes ?? [],
      rules_issued: allRules
        .filter((rule) => rule.runId === r.id)
        .map((rule) => ({ category: rule.category, rule: rule.rule })),
    })),
    rule_validation: ruleValidation(allRules, scored, baselineAvg),
    judge_vs_actual: judgeVsActual(scored),
    improvement_delta: improvementDelta(scored, previousRun),
  };

  const system = learningSystemPrompt();
  const user = `Performance analysis (${scored.length} videos with analytics).\n\n${JSON.stringify(payload, null, 2)}`;

  const raw: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_learning_analysis",
    schema: LEARNING_SCHEMA as unknown as Record<string, unknown>,
    purpose: "learning",
  });

  const runId = makeId("learn");

  // New rules supersede the previous learning run's rules (seed + manual stay).
  for (const r of allRules) {
    if (r.source === "learning_run" && r.active) {
      r.active = false;
      await repo.updateRule(r);
    }
  }
  const newRuleIds: string[] = [];
  for (const nr of raw.new_rules ?? []) {
    if (!RULE_CATEGORIES.includes(nr?.category)) continue;
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
    platformNotes: strArr(raw.platform_notes),
    judgeCalibrationNotes: strArr(raw.judge_calibration_notes),
    bestLengthSeconds: Number(raw.best_length_seconds) || undefined,
    bestCategories: strArr(raw.best_categories),
    bestTone: raw.best_tone ? String(raw.best_tone) : undefined,
    newRuleIds,
    improvementDelta: payload.improvement_delta?.delta,
    previousRunId: previousRun?.id,
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

function describeVideo(s: ScoredVideo) {
  return {
    video_id: s.video.id,
    hook: s.video.pkg.selectedHook,
    category: s.video.pkg.category,
    length_seconds: s.video.pkg.estimatedLengthSeconds,
    caption_lines: s.video.pkg.captionLines.length,
    avg_caption_words: avgWords(s.video.pkg.captionLines.map((l) => l.text)),
    platform: s.metrics.platform,
    views: s.metrics.views,
    completion_rate: s.metrics.completionRate,
    skip_rate: s.metrics.skipRate,
    avg_watch_time: s.metrics.avgWatchTime,
    saves: s.metrics.saves,
    shares: s.metrics.shares,
    likes: s.metrics.likes,
    engagement_score: round1(s.score),
  };
}

function platformAggregates(scored: ScoredVideo[]) {
  const groups = new Map<string, ScoredVideo[]>();
  for (const s of scored) {
    const list = groups.get(s.metrics.platform) ?? [];
    list.push(s);
    groups.set(s.metrics.platform, list);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([platform, list]) => [
      platform,
      {
        n: list.length,
        avg_engagement: round1(avg(list.map((s) => s.score))),
        avg_completion: round1(avg(list.map((s) => s.metrics.completionRate)) * 100) / 100,
        avg_length: Math.round(avg(list.map((s) => s.video.pkg.estimatedLengthSeconds))),
      },
    ]),
  );
}

/** Cohort check: did videos generated under each issued rule beat the baseline? */
function ruleValidation(allRules: LearningRule[], scored: ScoredVideo[], baselineAvg: number) {
  return allRules
    .filter((r) => r.source === "learning_run" && r.category !== "calibration")
    .map((r) => {
      const cohort = scored.filter((s) => s.video.appliedRuleIds?.includes(r.id));
      if (cohort.length === 0) return null;
      return {
        rule: r.rule,
        category: r.category,
        active: r.active,
        cohort_n: cohort.length,
        cohort_avg_engagement: round1(avg(cohort.map((s) => s.score))),
        baseline_avg_engagement: round1(baselineAvg),
      };
    })
    .filter(Boolean);
}

/** Predicted vs actual: judge scores against real engagement percentile. */
function judgeVsActual(scored: ScoredVideo[]) {
  const n = scored.length;
  // scored is sorted best-first; percentile 100 = best performer.
  return scored
    .map((s, i) => {
      if (!s.video.judge) return null;
      return {
        video_id: s.video.id,
        hook: s.video.pkg.selectedHook,
        judged_viral_potential: s.video.judge.viralPotential,
        judged_overall: s.video.judge.overallScore,
        actual_engagement: round1(s.score),
        actual_percentile: Math.round(((n - 1 - i) / Math.max(1, n - 1)) * 100),
      };
    })
    .filter(Boolean);
}

/** Are videos published after the previous run beating the ones before it? */
function improvementDelta(scored: ScoredVideo[], previousRun?: LearningRun) {
  if (!previousRun) return null;
  const before = scored.filter((s) => (s.video.publishedAt ?? s.video.createdAt) <= previousRun.createdAt);
  const after = scored.filter((s) => (s.video.publishedAt ?? s.video.createdAt) > previousRun.createdAt);
  if (!before.length || !after.length) return null;
  const beforeAvg = avg(before.map((s) => s.score));
  const afterAvg = avg(after.map((s) => s.score));
  return {
    previous_run_id: previousRun.id,
    before_n: before.length,
    before_avg_engagement: round1(beforeAvg),
    after_n: after.length,
    after_avg_engagement: round1(afterAvg),
    delta: round1(afterAvg - beforeAvg),
  };
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function avgWords(lines: string[]): number {
  if (!lines.length) return 0;
  const total = lines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  return Math.round((total / lines.length) * 10) / 10;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
