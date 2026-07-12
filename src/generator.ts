// Script/package generator: topic -> full structured video package via the LLM
// (strict JSON schema), then validated + caption-normalized before anything
// downstream trusts it. Wire format is snake_case (what the model emits),
// domain format is camelCase.

import type { JudgeScores, LearningRule, Topic, VideoPackage, CaptionLine, Platform } from "./types.js";
import type { LlmClient } from "./llm.js";
import { packageSystemPrompt, packageUserPrompt, PROMPT_VERSIONS, type PromptPattern } from "./prompts.js";
import { normalizeCaptions, validateCaptions } from "./captions.js";

export const PACKAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "topic", "category", "target_platform", "hook_options", "selected_hook", "script",
    "scene_direction", "avatar_tone", "caption_lines", "title", "thumbnail_text",
    "post_caption", "hashtags", "cta", "estimated_length_seconds",
  ],
  properties: {
    topic: { type: "string" },
    category: { type: "string" },
    target_platform: { type: "string", enum: ["tiktok", "reels", "shorts"] },
    hook_options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    selected_hook: { type: "string" },
    script: { type: "string" },
    scene_direction: { type: "string" },
    avatar_tone: { type: "string" },
    caption_lines: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start_hint", "end_hint", "text", "emphasis", "position", "style"],
        properties: {
          start_hint: { type: "number" },
          end_hint: { type: "number" },
          text: { type: "string" },
          emphasis: { type: "string" },
          position: { type: "string", enum: ["lower_center", "upper_center", "middle"] },
          style: { type: "string", enum: ["curio_premium"] },
        },
      },
    },
    title: { type: "string" },
    thumbnail_text: { type: "string" },
    post_caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
    cta: { type: "string" },
    estimated_length_seconds: { type: "number" },
  },
} as const;

export class PackageValidationError extends Error {
  constructor(public issues: string[]) {
    super(`invalid video package: ${issues.join("; ")}`);
  }
}

/** Hand-rolled structural validation — the contract tests rely on this, and it
 * also guards mock/stub outputs that never went through OpenAI's schema check. */
export function validateRawPackage(raw: any): string[] {
  const issues: string[] = [];
  const str = (k: string) => { if (typeof raw?.[k] !== "string" || !raw[k].trim()) issues.push(`missing/empty ${k}`); };
  ["topic", "category", "selected_hook", "script", "scene_direction", "avatar_tone",
    "title", "thumbnail_text", "post_caption", "cta"].forEach(str);
  if (!["tiktok", "reels", "shorts"].includes(raw?.target_platform)) issues.push("bad target_platform");
  if (!Array.isArray(raw?.hook_options) || raw.hook_options.length < 3) issues.push("need >=3 hook_options");
  if (!Array.isArray(raw?.hashtags) || raw.hashtags.length < 3) issues.push("need >=3 hashtags");
  if (!Array.isArray(raw?.caption_lines) || raw.caption_lines.length < 3) issues.push("need >=3 caption_lines");
  else {
    raw.caption_lines.forEach((l: any, i: number) => {
      if (typeof l?.text !== "string" || !l.text.trim()) issues.push(`caption_lines[${i}] missing text`);
      if (typeof l?.start_hint !== "number" || typeof l?.end_hint !== "number") issues.push(`caption_lines[${i}] missing timing`);
    });
  }
  if (typeof raw?.estimated_length_seconds !== "number") issues.push("missing estimated_length_seconds");
  return issues;
}

function toDomain(raw: any): VideoPackage {
  const captionLines: CaptionLine[] = raw.caption_lines.map((l: any) => ({
    startHint: l.start_hint,
    endHint: l.end_hint,
    text: String(l.text),
    emphasis: String(l.emphasis ?? ""),
    position: l.position ?? "lower_center",
    style: "curio_premium",
  }));
  return {
    topic: raw.topic,
    category: raw.category,
    targetPlatform: raw.target_platform as Platform,
    hookOptions: raw.hook_options.map(String),
    selectedHook: raw.selected_hook,
    script: raw.script,
    sceneDirection: raw.scene_direction,
    avatarTone: raw.avatar_tone,
    captionLines,
    title: raw.title,
    thumbnailText: raw.thumbnail_text,
    postCaption: raw.post_caption,
    hashtags: raw.hashtags.map(String),
    cta: raw.cta,
    estimatedLengthSeconds: raw.estimated_length_seconds,
  };
}

export interface GeneratedPackage {
  pkg: VideoPackage;
  promptVersion: string;
  input: { system: string; user: string };
  rawOutput: unknown;
}

export async function generatePackage(
  llm: LlmClient,
  topic: Topic,
  activeRules: LearningRule[],
  feedback?: JudgeScores,
  patterns: PromptPattern[] = [],
): Promise<GeneratedPackage> {
  const system = packageSystemPrompt(activeRules, patterns);
  const user = packageUserPrompt(topic, feedback);
  const raw: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_video_package",
    schema: PACKAGE_SCHEMA as unknown as Record<string, unknown>,
    purpose: "package",
  });

  const issues = validateRawPackage(raw);
  if (issues.length) throw new PackageValidationError(issues);

  const pkg = toDomain(raw);
  // Models sometimes wrap emphasis in markdown — captions are rendered as
  // literal glyphs, so strip markers everywhere and rely on the emphasis field.
  const stripMd = (s: string) => s.replace(/\*\*|__|\*/g, "").replace(/\s+/g, " ").trim();
  pkg.title = stripMd(pkg.title);
  pkg.selectedHook = stripMd(pkg.selectedHook);
  pkg.captionLines = pkg.captionLines.map((l) => ({ ...l, text: stripMd(l.text), emphasis: stripMd(l.emphasis) }));

  if (topic.format === "card") {
    // Card items are LIST ENTRIES, not narration beats: never split them into
    // fragments — a numbered half-sentence breaks the read-a-card format.
    // Emphasis must stay 1-3 words or it stops signalling hierarchy: overlong
    // phrases are trimmed to their tail (a suffix of a contained phrase is
    // still contained). Max 5 items — density killed card v1's readability.
    const trimEmphasis = (emphasis: string, text: string): string => {
      if (!emphasis || !text.toLowerCase().includes(emphasis.toLowerCase())) return "";
      const words = emphasis.split(/\s+/);
      if (words.length <= 3) return emphasis;
      const tail = words.slice(-3).join(" ");
      return text.toLowerCase().includes(tail.toLowerCase()) ? tail : "";
    };
    pkg.captionLines = pkg.captionLines
      .filter((l) => l.text.length > 0)
      .slice(0, 5)
      .map((l, i) => ({
        ...l,
        emphasis: trimEmphasis(l.emphasis, l.text),
        startHint: i * 2,
        endHint: i * 2 + 2,
      }));
    if (pkg.captionLines.length < 3) {
      throw new PackageValidationError(["card needs >=3 list items"]);
    }
  } else {
    // Repair caption drift (overlong lines, broken timing) instead of failing;
    // anything the normalizer can't fix is a hard error.
    pkg.captionLines = normalizeCaptions(pkg.captionLines);
    const remaining = validateCaptions(pkg.captionLines);
    if (remaining.length) {
      throw new PackageValidationError(remaining.map((r) => `caption[${r.index}]: ${r.problem}`));
    }
  }
  return {
    pkg,
    promptVersion: PROMPT_VERSIONS.package,
    input: { system, user },
    rawOutput: raw,
  };
}
