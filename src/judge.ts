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
    "brand_fit", "viral_potential", "factual_safety", "overall_score",
    "outcome_check", "problems", "fix",
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
    // One-outcome verification: name the intended primary outcome and the
    // EXACT moment engineered to produce it. Vague mechanism claims fail.
    outcome_check: { type: "string" },
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
  /** Exact model id the API reported for this judge call (snapshot). */
  modelUsed: string;
}

export async function judgePackage(
  llm: LlmClient,
  pkg: VideoPackage,
  calibration: LearningRule[] = [],
  format: "narrated" | "card" = "narrated",
): Promise<JudgeResult> {
  const system = judgeSystemPrompt(calibration);
  // Cards are judged as CARDS: without this, the judge fails static cards
  // against narration criteria (pacing, loop endings, spoken delivery).
  const cardNote = format === "card"
    ? `\nFORMAT: STATIC READ-A-CARD SHORT (4-6s single frame, NO narration in the
final video; the script field is unused). Judge accordingly:
- hook_score = does the TITLE alone stop the scroll;
- retention_score = does the item ORDERING keep pulling the eye down the list;
- viral_potential = save/screenshot/send-worthiness — specificity wins: named
  mechanisms and vivid phrasing beat generic psych-account lines;
- caption_readability = list items scannable in one glance each;
- IGNORE narration pacing, loop-back endings, spoken delivery, and script quality.`
    : "";
  const user = `Score this Curio ${format} package.${cardNote}\n\nJSON package:\n${JSON.stringify(wireFormat(pkg), null, 2)}`;
  let modelUsed = llm.model;
  const raw: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_judge_scores",
    schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    purpose: "judge",
    onModel: (m) => { modelUsed = m; },
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
    outcomeCheck: String(raw.outcome_check ?? ""),
    problems: Array.isArray(raw.problems) ? raw.problems.map(String) : [],
    fix: String(raw.fix ?? ""),
  };
  const scores: JudgeScores = { ...partial, pass: meetsThresholds(partial) };
  return { scores, promptVersion: PROMPT_VERSIONS.judge, input: { system, user }, rawOutput: raw, modelUsed };
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
    // The generator's design claim, for the judge to verify against the script.
    primary_outcome: pkg.primaryOutcome ?? null,
    secondary_outcome: pkg.secondaryOutcome ?? null,
    outcome_moment: pkg.outcomeMoment ?? null,
  };
}

function int(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0;
}
