// Faceless founder-journal generator.
//
// This is intentionally separate from the narrated curiosity pipeline. It
// generates an evidence-led edit kit for the Curio main account; it never
// invokes ElevenLabs, HeyGen, or the local mystery renderer. A human still
// supplies/approves the true story and the Curio product/build artifacts.

import type { CaptionLine, Platform, ViewerOutcome } from "./types.js";
import type { LlmClient } from "./llm.js";

export const FOUNDER_KIT_PROMPT_VERSION = "founder_kit_v1_faceless_evidence";

export const FOUNDER_PILLARS = [
  "why_curio_exists",
  "building_in_public",
  "honest_struggle",
  "product_decision",
  "progress_update",
] as const;

export type FounderPillar = typeof FOUNDER_PILLARS[number];
export type FounderDeliveryMode = "synthetic_voiceover" | "founder_voiceover" | "text_only";

export interface FounderVideoInput {
  storySeed: string;
  proofPoints: string[];
  availableAssets: string[];
  targetPlatform: Platform;
  targetLengthSeconds: number;
  deliveryMode: FounderDeliveryMode;
}

export type FounderAssetType =
  | "app_capture"
  | "build_artifact"
  | "proof_screenshot"
  | "generated_broll"
  | "typography";

export interface FounderEditBeat {
  startHint: number;
  endHint: number;
  narration: string;
  visual: string;
  overlayText: string;
  assetType: FounderAssetType;
  purpose: string;
}

export interface FounderProofRequirement {
  claim: string;
  evidence: string;
  blocking: boolean;
}

export interface FounderAssetRequirement {
  asset: string;
  source: "curio_capture" | "founder_supplied" | "generated" | "typography";
  required: boolean;
}

export interface FounderVideoKit {
  conceptTitle: string;
  pillar: FounderPillar;
  hookOptions: string[];
  selectedHook: string;
  storyPromise: string;
  narrationScript: string;
  editBeats: FounderEditBeat[];
  captionLines: CaptionLine[];
  proofRequirements: FounderProofRequirement[];
  assetChecklist: FounderAssetRequirement[];
  postCaption: string;
  hashtags: string[];
  invitationCta: string;
  disclosureNote: string;
  verificationNeeded: string[];
  primaryOutcome: ViewerOutcome;
  secondaryOutcome?: ViewerOutcome;
  outcomeMoment: string;
  estimatedLengthSeconds: number;
}

export interface GeneratedFounderKit {
  kit: FounderVideoKit;
  promptVersion: string;
  input: { system: string; user: string };
  rawOutput: unknown;
  modelUsed: string;
}

const ASSET_TYPES: FounderAssetType[] = [
  "app_capture", "build_artifact", "proof_screenshot", "generated_broll", "typography",
];
const OUTCOMES: ViewerOutcome[] = ["retention", "shares", "saves", "comments", "likes"];

export const FOUNDER_KIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "concept_title", "pillar", "hook_options", "selected_hook", "story_promise",
    "narration_script", "edit_beats", "caption_lines", "proof_requirements",
    "asset_checklist", "post_caption", "hashtags", "invitation_cta",
    "disclosure_note", "verification_needed", "primary_outcome",
    "secondary_outcome", "outcome_moment", "estimated_length_seconds",
  ],
  properties: {
    concept_title: { type: "string" },
    pillar: { type: "string", enum: FOUNDER_PILLARS },
    hook_options: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
    selected_hook: { type: "string" },
    story_promise: { type: "string" },
    narration_script: { type: "string" },
    edit_beats: {
      type: "array", minItems: 5, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["start_hint", "end_hint", "narration", "visual", "overlay_text", "asset_type", "purpose"],
        properties: {
          start_hint: { type: "number" },
          end_hint: { type: "number" },
          narration: { type: "string" },
          visual: { type: "string" },
          overlay_text: { type: "string" },
          asset_type: { type: "string", enum: ASSET_TYPES },
          purpose: { type: "string" },
        },
      },
    },
    caption_lines: {
      type: "array", minItems: 4, maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
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
    proof_requirements: {
      type: "array", minItems: 1, maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        required: ["claim", "evidence", "blocking"],
        properties: {
          claim: { type: "string" }, evidence: { type: "string" }, blocking: { type: "boolean" },
        },
      },
    },
    asset_checklist: {
      type: "array", minItems: 3, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["asset", "source", "required"],
        properties: {
          asset: { type: "string" },
          source: { type: "string", enum: ["curio_capture", "founder_supplied", "generated", "typography"] },
          required: { type: "boolean" },
        },
      },
    },
    post_caption: { type: "string" },
    hashtags: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    invitation_cta: { type: "string" },
    disclosure_note: { type: "string" },
    verification_needed: { type: "array", items: { type: "string" } },
    primary_outcome: { type: "string", enum: OUTCOMES },
    secondary_outcome: { type: ["string", "null"], enum: [...OUTCOMES, null] },
    outcome_moment: { type: "string" },
    estimated_length_seconds: { type: "number" },
  },
} as const;

export class FounderKitValidationError extends Error {
  constructor(public issues: string[]) {
    super(`invalid founder video kit: ${issues.join("; ")}`);
  }
}

export function founderKitSystemPrompt(): string {
  return `You create FACELESS founder-journal video edit kits for Curio's main social account.
Curio is a premium iOS app that turns scrolling into rabbit holes worth reading.

This is founder-led in POINT OF VIEW, not in camera presence. The founder will not
appear in real footage. Do not invent a synthetic founder face, talking head, avatar,
fake office, fake hands, fake team, or fake behind-the-scenes event. The human feeling
must come from specificity, restraint, first-person reflection, and visible product proof.

Use only facts in the supplied story seed and proof points. Never invent a timeline,
user count, revenue, hours spent, rejection, launch status, quote, metric, or personal
emotion. If a potentially useful claim is not supplied, keep it OUT of the narration
and add it to verification_needed. Every factual or product claim needs a matching
proof_requirement and an honest on-screen source.

FORMAT:
- 20-35 seconds, one personal tension, one product insight, one honest struggle.
- Frame zero: a complete first-person contradiction in plain language. No logo intro.
- The first 2 seconds must show Curio or a real build artifact, not generic mood footage.
- Use real Curio screen recordings, UI iterations, notes, code/build artifacts, or
  redacted proof screenshots as the story spine. Generated object/environment b-roll
  may bridge at most two short beats; it must never pretend to document a real event.
- Use 10-12 edit beats for a 30-second kit, normally 2-2.75 seconds each.
  Every beat adds evidence or a meaningful screen state. Crops are not beats.
- Captions: stable lower-center, 2-5 words where practical, max 2 lines, no karaoke.
- The first caption is the COMPLETE contradiction at frame zero (maximum 8
  words); never split it into a setup card and a one-word payoff card.
- The invitation is into the journey: "I'm documenting what happens next" energy.
  No "download now", feature dump, startup jargon, hype, or generic inspiration.
- Do not say "as a founder", "revolutionary", "game-changing", "our mission is",
  "we're changing education", or "I can't wait to share this journey".
- Avoid over-polished ad grammar. The narration should sound like one person admitting
  something specific, with natural contractions and one slightly vulnerable turn.
- Do not use em dashes or en dashes in narration; use commas or periods so TTS
  cannot turn punctuation into an audio artifact.

OUTCOME: choose one primary viewer outcome and at most one secondary. For this format,
comments should come from genuine identification with the problem/build struggle, and
shares from a line viewers recognize in themselves. Name the exact outcome moment.

DELIVERY DISCLOSURE:
- synthetic_voiceover: disclosure_note must require the applicable AI-content label;
  the script may use first person only because the founder supplied and approved it.
- founder_voiceover: no face is shown; disclosure depends only on generated visuals.
- text_only: narration_script is still the editorial master used for on-screen pacing.

Return exactly five distinct, fully written hook options. Never output field names or
placeholders such as "selected_hook" as a hook option.

Return the full strict JSON edit kit. overlay_text should be empty when the caption is
enough. Each edit beat must state what the mute viewer learns from that visual. Edit
beats must cover the ENTIRE narration and target runtime through the final invitation;
never stop the visual plan early.`;
}

export function founderKitUserPrompt(input: FounderVideoInput): string {
  return `Founder video input JSON:\n${JSON.stringify({
    story_seed: input.storySeed,
    proof_points: input.proofPoints,
    available_assets: input.availableAssets,
    target_platform: input.targetPlatform,
    target_length_seconds: input.targetLengthSeconds,
    delivery_mode: input.deliveryMode,
  }, null, 2)}`;
}

export function validateRawFounderKit(raw: any): string[] {
  const issues: string[] = [];
  const needString = (key: string) => {
    if (typeof raw?.[key] !== "string" || !raw[key].trim()) issues.push(`missing/empty ${key}`);
  };
  ["concept_title", "selected_hook", "story_promise", "narration_script", "post_caption",
    "invitation_cta", "disclosure_note", "outcome_moment"].forEach(needString);
  if (!FOUNDER_PILLARS.includes(raw?.pillar)) issues.push("bad pillar");
  if (!Array.isArray(raw?.hook_options) || raw.hook_options.length < 4) issues.push("need >=4 hook_options");
  else {
    if (!raw.hook_options.includes(raw.selected_hook)) issues.push("selected_hook must be one of hook_options");
    const hooks = raw.hook_options.map((hook: unknown) => String(hook ?? "").trim());
    if (new Set(hooks.map((hook: string) => hook.toLowerCase())).size !== hooks.length) issues.push("hook_options must be distinct");
    hooks.forEach((hook: string, i: number) => {
      if (!hook || /^(?:selected[_ ]?hook|hook(?: option)?(?: \d+)?)$/i.test(hook)) {
        issues.push(`hook_options[${i}] is a field label/placeholder`);
      }
    });
  }
  if (/[—–]/.test(String(raw?.narration_script ?? ""))) issues.push("narration_script must not contain em/en dashes");
  if (!Array.isArray(raw?.edit_beats) || raw.edit_beats.length < 5) issues.push("need >=5 edit_beats");
  else {
    let priorEnd = 0;
    raw.edit_beats.forEach((b: any, i: number) => {
      if (typeof b?.start_hint !== "number" || typeof b?.end_hint !== "number" || b.end_hint <= b.start_hint) {
        issues.push(`edit_beats[${i}] has invalid timing`);
      } else {
        if (i === 0 && b.start_hint > 0.25) issues.push("first edit beat must start by 0.25s");
        if (i > 0 && b.start_hint > priorEnd + 0.75) issues.push(`edit_beats[${i}] leaves an uncovered timeline gap`);
        if (i > 0 && b.start_hint < priorEnd - 0.25) issues.push(`edit_beats[${i}] overlaps the prior beat`);
        priorEnd = b.end_hint;
      }
      if (!ASSET_TYPES.includes(b?.asset_type)) issues.push(`edit_beats[${i}] has bad asset_type`);
      for (const key of ["narration", "visual", "purpose"]) {
        if (typeof b?.[key] !== "string" || !b[key].trim()) issues.push(`edit_beats[${i}] missing ${key}`);
      }
    });
    const targetEnd = Number(raw?.estimated_length_seconds);
    if (Number.isFinite(targetEnd) && priorEnd < targetEnd - 1) issues.push("edit_beats must cover the full estimated runtime");
    const plain = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
    const script = plain(raw?.narration_script);
    const beatNarration = plain(raw.edit_beats.map((b: any) => b?.narration ?? "").join(" "));
    if (script && beatNarration !== script) issues.push("edit_beats narration must cover the narration_script exactly");
  }
  if (!Array.isArray(raw?.caption_lines) || raw.caption_lines.length < 4) issues.push("need >=4 caption_lines");
  if (!Array.isArray(raw?.proof_requirements) || raw.proof_requirements.length < 1) issues.push("need proof_requirements");
  if (!Array.isArray(raw?.asset_checklist) || raw.asset_checklist.length < 3) issues.push("need >=3 asset_checklist items");
  if (!Array.isArray(raw?.hashtags) || raw.hashtags.length < 3) issues.push("need >=3 hashtags");
  if (!Array.isArray(raw?.verification_needed)) issues.push("verification_needed must be an array");
  if (!OUTCOMES.includes(raw?.primary_outcome)) issues.push("bad primary_outcome");
  if (raw?.secondary_outcome != null && !OUTCOMES.includes(raw.secondary_outcome)) issues.push("bad secondary_outcome");
  if (raw?.secondary_outcome != null && raw.secondary_outcome === raw?.primary_outcome) {
    issues.push("secondary_outcome must differ from primary_outcome");
  }
  if (typeof raw?.estimated_length_seconds !== "number") issues.push("missing estimated_length_seconds");
  return issues;
}

export function founderKitFromRaw(raw: any, input?: FounderVideoInput): FounderVideoKit {
  const strip = (value: unknown) => String(value ?? "").replace(/\*\*|__|\*/g, "").replace(/\s+/g, " ").trim();
  const stripCaption = (value: unknown) => String(value ?? "")
    .replace(/\*\*|__|\*/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  const captionLines: CaptionLine[] = (raw.caption_lines ?? []).map((line: any) => ({
    startHint: Number(line.start_hint),
    endHint: Number(line.end_hint),
    text: stripCaption(line.text),
    emphasis: strip(line.emphasis),
    position: line.position ?? "lower_center",
    style: "curio_premium" as const,
  }));
  const captionIssues = validateFounderCaptions(captionLines, Number(raw.estimated_length_seconds));
  if (captionIssues.length) {
    throw new FounderKitValidationError(captionIssues.map((i) => `caption[${i.index}]: ${i.problem}`));
  }

  const verificationNeeded: string[] = Array.isArray(raw.verification_needed)
    ? raw.verification_needed.map((item: unknown) => strip(item)).filter(Boolean)
    : [];
  if (input) {
    const supplied = [input.storySeed, ...input.proofPoints].join(" ").toLowerCase();
    const visibleCopy = [raw.selected_hook, raw.narration_script, raw.post_caption]
      .map(strip).join(" ");
    const numericClaims = visibleCopy.match(/(?:\$\s*)?\d+(?:[.,]\d+)*(?:\s*%|\s*(?:hours?|days?|weeks?|months?|years?))?/gi) ?? [];
    for (const claim of numericClaims) {
      if (!supplied.includes(claim.toLowerCase())) {
        verificationNeeded.push(`Verify or remove unsupplied numeric claim: ${claim}`);
      }
    }
  }

  return {
    conceptTitle: strip(raw.concept_title),
    pillar: raw.pillar,
    hookOptions: raw.hook_options.map(strip),
    selectedHook: strip(raw.selected_hook),
    storyPromise: strip(raw.story_promise),
    narrationScript: strip(raw.narration_script),
    editBeats: raw.edit_beats.map((beat: any) => ({
      startHint: Number(beat.start_hint), endHint: Number(beat.end_hint),
      narration: strip(beat.narration), visual: strip(beat.visual),
      overlayText: strip(beat.overlay_text), assetType: beat.asset_type,
      purpose: strip(beat.purpose),
    })),
    captionLines,
    proofRequirements: raw.proof_requirements.map((item: any) => ({
      claim: strip(item.claim), evidence: strip(item.evidence), blocking: item.blocking === true,
    })),
    assetChecklist: raw.asset_checklist.map((item: any) => ({
      asset: strip(item.asset), source: item.source, required: item.required === true,
    })),
    postCaption: strip(raw.post_caption),
    hashtags: raw.hashtags.map(strip),
    invitationCta: strip(raw.invitation_cta),
    disclosureNote: strip(raw.disclosure_note),
    verificationNeeded: [...new Set(verificationNeeded)],
    primaryOutcome: raw.primary_outcome,
    secondaryOutcome: raw.secondary_outcome ?? undefined,
    outcomeMoment: strip(raw.outcome_moment),
    estimatedLengthSeconds: Number(raw.estimated_length_seconds),
  };
}

function validateFounderCaptions(lines: CaptionLine[], estimatedLength: number) {
  const issues: Array<{ index: number; problem: string }> = [];
  lines.forEach((line, i) => {
    const words = line.text.split(/\s+/).filter(Boolean);
    const maxWords = i === 0 ? 8 : 7;
    if (!words.length) issues.push({ index: i, problem: "empty line" });
    if (words.length > maxWords) issues.push({ index: i, problem: `too many words (${words.length} > ${maxWords})` });
    if (line.text.split("\n").length > 2) issues.push({ index: i, problem: "more than two lines" });
    if (!(line.endHint > line.startHint)) issues.push({ index: i, problem: "end must be after start" });
    const maxDuration = i === 0 ? 6 : 4;
    if (line.endHint - line.startHint > maxDuration) issues.push({ index: i, problem: `caption held longer than ${maxDuration}s` });
    if (line.emphasis && !line.text.toLowerCase().includes(line.emphasis.toLowerCase())) {
      issues.push({ index: i, problem: "emphasis phrase not found in text" });
    }
  });
  if (lines[0] && lines[0].startHint > 0.25) issues.push({ index: 0, problem: "first caption must start by 0.25s" });
  const last = lines[lines.length - 1];
  if (last && Number.isFinite(estimatedLength) && last.endHint < estimatedLength - 1) {
    issues.push({ index: lines.length - 1, problem: "captions do not cover the spoken runtime" });
  }
  return issues;
}

export async function generateFounderVideoKit(
  llm: LlmClient,
  input: FounderVideoInput,
): Promise<GeneratedFounderKit> {
  const system = founderKitSystemPrompt();
  const user = founderKitUserPrompt(input);
  let modelUsed = llm.model;
  const raw = await llm.generateJson({
    system,
    user,
    schemaName: "curio_founder_video_kit",
    schema: FOUNDER_KIT_SCHEMA as unknown as Record<string, unknown>,
    purpose: "package",
    timeoutMs: 240_000,
    onModel: (model) => { modelUsed = model; },
  });
  const issues = validateRawFounderKit(raw);
  if (issues.length) throw new FounderKitValidationError(issues);
  return {
    kit: founderKitFromRaw(raw, input),
    promptVersion: FOUNDER_KIT_PROMPT_VERSION,
    input: { system, user },
    rawOutput: raw,
    modelUsed,
  };
}

export function normalizeFounderVideoInput(body: any): FounderVideoInput {
  const storySeed = typeof body?.story_seed === "string" ? body.story_seed.trim() : "";
  if (storySeed.length < 20) throw new FounderKitValidationError(["story_seed must be at least 20 characters"]);
  const platform = String(body?.target_platform ?? "reels").toLowerCase() as Platform;
  if (!(["tiktok", "reels", "shorts"] as Platform[]).includes(platform)) {
    throw new FounderKitValidationError(["target_platform must be tiktok | reels | shorts"]);
  }
  const delivery = String(body?.delivery_mode ?? "synthetic_voiceover") as FounderDeliveryMode;
  if (!(["synthetic_voiceover", "founder_voiceover", "text_only"] as FounderDeliveryMode[]).includes(delivery)) {
    throw new FounderKitValidationError(["delivery_mode must be synthetic_voiceover | founder_voiceover | text_only"]);
  }
  const list = (value: unknown): string[] => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
    : [];
  const requestedLength = Number(body?.target_length_seconds) || 30;
  return {
    storySeed,
    proofPoints: list(body?.proof_points),
    availableAssets: list(body?.available_assets),
    targetPlatform: platform,
    targetLengthSeconds: Math.max(20, Math.min(35, Math.round(requestedLength))),
    deliveryMode: delivery,
  };
}

export function founderKitWire(kit: FounderVideoKit) {
  return {
    concept_title: kit.conceptTitle,
    pillar: kit.pillar,
    hook_options: kit.hookOptions,
    selected_hook: kit.selectedHook,
    story_promise: kit.storyPromise,
    narration_script: kit.narrationScript,
    edit_beats: kit.editBeats.map((beat) => ({
      start_hint: beat.startHint, end_hint: beat.endHint, narration: beat.narration,
      visual: beat.visual, overlay_text: beat.overlayText, asset_type: beat.assetType,
      purpose: beat.purpose,
    })),
    caption_lines: kit.captionLines.map((line) => ({
      start_hint: line.startHint, end_hint: line.endHint, text: line.text,
      emphasis: line.emphasis, position: line.position, style: line.style,
    })),
    proof_requirements: kit.proofRequirements.map((item) => ({
      claim: item.claim, evidence: item.evidence, blocking: item.blocking,
    })),
    asset_checklist: kit.assetChecklist.map((item) => ({
      asset: item.asset, source: item.source, required: item.required,
    })),
    post_caption: kit.postCaption,
    hashtags: kit.hashtags,
    invitation_cta: kit.invitationCta,
    disclosure_note: kit.disclosureNote,
    verification_needed: kit.verificationNeeded,
    primary_outcome: kit.primaryOutcome,
    secondary_outcome: kit.secondaryOutcome ?? null,
    outcome_moment: kit.outcomeMoment,
    estimated_length_seconds: kit.estimatedLengthSeconds,
  };
}
