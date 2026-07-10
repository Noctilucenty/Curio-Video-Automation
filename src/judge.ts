// Pre-publish quality gate. A package that fails the thresholds goes back into
// the rewrite loop (max 2 auto-regens) instead of wasting a HeyGen render.
// Calibration rules (learned from predicted-vs-actual analytics) correct the
// judge's biases over time.

import type { JudgeScores, LearningRule, VideoPackage } from "./types.js";
import type { LlmClient } from "./llm.js";
import { judgeSystemPrompt, PROMPT_VERSIONS } from "./prompts.js";

export const PUBLISH_THRESHOLDS = {
  hookScore: 8,
  captionReadability: 8,
  brandFit: 8,
  viralPotential: 7,
  factualSafety: 8,
} as const;

export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "hook_score", "retention_score", "clarity_score", "caption_readability",
    "brand_fit", "viral_potential", "factual_safety", "overall_score", "problems", "fix",
  ],
  properties: {
    hook_score: { type: "integer", minimum: 0, maximum: 10 },
    retention_score: { type: "integer", minimum: 0, maximum: 10 },
    clarity_score: { type: "integer", minimum: 0, maximum: 10 },
    caption_readability: { type: "integer", minimum: 0, maximum: 10 },
    brand_fit: { type: "integer", minimum: 0, maximum: 10 },
    viral_potential: { type: "integer", minimum: 0, maximum: 10 },
    factual_safety: { type: "integer", minimum: 0, maximum: 10 },
    overall_score: { type: "integer", minimum: 0, maximum: 10 },
    problems: { type: "array", items: { type: "string" } },
    fix: { type: "string" },
  },
} as const;

export function meetsThresholds(s: Omit<JudgeScores, "pass">): boolean {
  return (
    s.hookScore >= PUBLISH_THRESHOLDS.hookScore &&
    s.captionReadability >= PUBLISH_THRESHOLDS.captionReadability &&
    s.brandFit >= PUBLISH_THRESHOLDS.brandFit &&
    s.viralPotential >= PUBLISH_THRESHOLDS.viralPotential &&
    s.factualSafety >= PUBLISH_THRESHOLDS.factualSafety
  );
}

export interface JudgeResult {
  scores: JudgeScores;
  promptVersion: string;
  input: { system: string; user: string };
  rawOutput: unknown;
}

export async function judgePackage(
  llm: LlmClient,
  pkg: VideoPackage,
  calibration: LearningRule[] = [],
): Promise<JudgeResult> {
  const system = judgeSystemPrompt(calibration);
  // The judge sees the wire-format package (what a fresh reviewer would see).
  const user = `Score this Curio video package.\n\nJSON package:\n${JSON.stringify(wireFormat(pkg), null, 2)}`;
  const raw: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_judge_scores",
    schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    purpose: "judge",
  });

  const partial = {
    hookScore: int(raw.hook_score),
    retentionScore: int(raw.retention_score),
    clarityScore: int(raw.clarity_score),
    captionReadability: int(raw.caption_readability),
    brandFit: int(raw.brand_fit),
    viralPotential: int(raw.viral_potential),
    factualSafety: int(raw.factual_safety),
    overallScore: int(raw.overall_score),
    problems: Array.isArray(raw.problems) ? raw.problems.map(String) : [],
    fix: String(raw.fix ?? ""),
  };
  const scores: JudgeScores = { ...partial, pass: meetsThresholds(partial) };
  return { scores, promptVersion: PROMPT_VERSIONS.judge, input: { system, user }, rawOutput: raw };
}

function wireFormat(pkg: VideoPackage) {
  return {
    topic: pkg.topic,
    category: pkg.category,
    target_platform: pkg.targetPlatform,
    selected_hook: pkg.selectedHook,
    script: pkg.script,
    caption_lines: pkg.captionLines.map((l) => ({
      start_hint: l.startHint, end_hint: l.endHint, text: l.text, emphasis: l.emphasis,
    })),
    title: pkg.title,
    post_caption: pkg.postCaption,
    hashtags: pkg.hashtags,
    cta: pkg.cta,
    estimated_length_seconds: pkg.estimatedLengthSeconds,
  };
}

function int(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0;
}
