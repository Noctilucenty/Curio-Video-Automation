// Fact-check stage — SEPARATE from the creative judge, and it runs BEFORE any
// render. The judge asks "will this hold attention?"; this stage asks "is any
// claim wrong, contested, or stated more absolutely than the evidence allows?"
// Two layers:
//   1. A deterministic contested-claims screen (code, zero tokens): findings
//      from the psychology replication crisis must never be stated as settled
//      fact. This is the layer that would have caught the ego-depletion card —
//      a strong creative judge approved it, so the lesson is structural.
//   2. An LLM factuality pass (xhigh reasoning, LEAN prompt: no brand-voice or
//      retention material — a fact-checker with the creative brief in context
//      starts grading vibes).
// A failure feeds the rewrite loop exactly like judge feedback; nothing that
// fails here can reach a renderer.

import type { VideoPackage } from "./types.js";
import type { LlmClient } from "./llm.js";
import { PROMPT_VERSIONS } from "./prompts.js";

/**
 * Contested / non-replicated / overclaimed psychology findings. Naming one of
 * these as flat fact fails the package unless the surrounding sentence openly
 * flags the dispute. The list is data — extend it as reviews find new ones.
 */
export const CONTESTED_CLAIMS: Array<{ term: RegExp; name: string; note: string }> = [
  { term: /ego[\s-]?depletion/i, name: "ego depletion", note: "failed large pre-registered replications (e.g. Hagger et al. 2016 RRR); willpower-as-fuel is contested" },
  { term: /power[\s-]?pos(e|ing|es)/i, name: "power posing", note: "hormonal/behavioral effects failed replication; original co-author disavowed" },
  { term: /learning\s+styles?/i, name: "learning styles", note: "matching instruction to visual/auditory style has no supported effect" },
  { term: /mozart\s+effect/i, name: "Mozart effect", note: "IQ-boost claim failed replication; effect is short-lived arousal at best" },
  { term: /\b(we|you|people)\s+(only\s+)?use\s+10%?\s*(percent\s*)?of\s+(your|our|the)\s+brain/i, name: "10% of the brain", note: "myth — imaging shows near-full utilization" },
  { term: /(left|right)[\s-]?brain(ed)?\s+(person|people|thinker|dominan)/i, name: "left/right-brained personality", note: "hemisphere-dominance personality typing is not supported" },
  { term: /marshmallow\s+test/i, name: "marshmallow test", note: "delayed-gratification life-outcome prediction largely vanished with controls (Watts et al. 2018)" },
  { term: /social\s+priming|primed\s+to\s+walk\s+slow/i, name: "social priming", note: "elderly-words/behavior priming effects failed replication" },
  { term: /dopamine\s+(detox|fast)/i, name: "dopamine detox", note: "pop concept; not how dopamine works" },
  { term: /mirror\s+neurons?\s+(make|explain|cause)/i, name: "mirror neurons explain empathy", note: "causal empathy claims outrun the evidence" },
  { term: /body\s+language\s+is\s+\d+%|93%\s+of\s+communication/i, name: "93% nonverbal communication", note: "misreading of Mehrabian's limited study" },
  { term: /mood\s+follows\s+posture|posture\s+(controls|sets)\s+mood/i, name: "posture controls mood", note: "facial/postural feedback effects are small and contested" },
];

/** Hedge markers that count as openly flagging a dispute in the same sentence. */
const DISPUTE_MARKERS = /contested|debated|disputed|controversial|failed\s+to\s+replicate|replication\s+crisis|scientists\s+disagree/i;

export interface FactCheckFinding {
  claim: string;
  verdict: "supported" | "contested" | "unsupported" | "overclaimed";
  issue: string;
  requiredFix: string;
}

export interface FactCheckResult {
  pass: boolean;
  findings: FactCheckFinding[];
  fix: string;
  promptVersion: string;
  /** null when the deterministic screen already failed the package (no tokens spent). */
  input: { system: string; user: string } | null;
  rawOutput: unknown;
  modelUsed: string;
}

export const FACTCHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "pass", "fix"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "verdict", "issue", "required_fix"],
        properties: {
          claim: { type: "string" },
          verdict: { type: "string", enum: ["supported", "contested", "unsupported", "overclaimed"] },
          issue: { type: "string" },
          required_fix: { type: "string" },
        },
      },
    },
    pass: { type: "boolean" },
    fix: { type: "string" },
  },
} as const;

/** Every text surface a viewer (or screenshot) can read. */
function claimSurfaces(pkg: VideoPackage): Array<{ where: string; text: string }> {
  return [
    { where: "title", text: pkg.title },
    { where: "hook", text: pkg.selectedHook },
    { where: "script", text: pkg.script },
    ...pkg.captionLines.map((l, i) => ({ where: `caption[${i}]`, text: l.text })),
    { where: "post_caption", text: pkg.postCaption },
  ];
}

/**
 * Deterministic layer. Returns findings (empty = clean). Sentence-level: a
 * contested term is allowed only when the SAME sentence openly flags the
 * dispute — "ego depletion is contested" passes, "ego depletion drains your
 * willpower" fails.
 */
export function screenContestedClaims(pkg: VideoPackage): FactCheckFinding[] {
  const findings: FactCheckFinding[] = [];
  for (const { where, text } of claimSurfaces(pkg)) {
    if (!text) continue;
    const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
    for (const sentence of sentences) {
      for (const { term, name, note } of CONTESTED_CLAIMS) {
        if (term.test(sentence) && !DISPUTE_MARKERS.test(sentence)) {
          findings.push({
            claim: `${where}: "${sentence.trim().slice(0, 120)}"`,
            verdict: "contested",
            issue: `states "${name}" as settled fact — ${note}`,
            requiredFix: `Remove the ${name} claim or reframe it as openly contested; prefer a robust, replicated mechanism instead.`,
          });
        }
      }
    }
  }
  return findings;
}

const FACTCHECK_SYSTEM = `You are a scientific fact-checker for short-form educational videos.
You receive the full text of one video package. Your ONLY job is factual integrity —
ignore style, retention, branding entirely.

For each checkable claim, output a finding:
- verdict "supported": mainstream, replicated, or well-documented — name the anchor
  (researcher, study, dataset, or historical record) in "issue" as the source note.
- verdict "contested": known replication failures or active scientific dispute.
- verdict "unsupported": no real evidence base / invented-sounding specifics.
- verdict "overclaimed": a real finding stated more absolutely than evidence allows
  (e.g. a tendency written as an iron law: "X controls Y", "always", "every").

Rules:
- Psychology claims need a named, replication-surviving basis; post-2015 replication-crisis
  casualties must be flagged contested even when phrased confidently.
- Historical/scientific mysteries may remain unresolved — but the FACTS cited must be real
  (dates, names, places, measurements). Fake mystery presented as verified fact = unsupported.
- Hedged tendencies ("tends to", "can", "often") with a real basis are fine.
- pass = true ONLY if there are zero contested/unsupported findings and any overclaimed
  findings are trivial word-level fixes you spell out in "fix".
Output one prioritized "fix" instruction for the rewrite loop.`;

/**
 * Full fact-check: deterministic screen first (free, instant), then the LLM
 * pass. Deterministic failures short-circuit — no tokens are spent on a
 * package that already contains a known-contested claim.
 */
export async function factCheckPackage(llm: LlmClient, pkg: VideoPackage): Promise<FactCheckResult> {
  const screened = screenContestedClaims(pkg);
  if (screened.length > 0) {
    return {
      pass: false,
      findings: screened,
      fix: screened[0].requiredFix,
      promptVersion: PROMPT_VERSIONS.factcheck,
      input: null,
      rawOutput: { deterministic: true, findings: screened },
      modelUsed: "deterministic-screen",
    };
  }

  const user = `Fact-check every claim in this package:\n${claimSurfaces(pkg)
    .map(({ where, text }) => `${where}: ${text}`)
    .join("\n")}`;
  let modelUsed = llm.model;
  const raw: any = await llm.generateJson({
    system: FACTCHECK_SYSTEM,
    user,
    schemaName: "curio_factcheck",
    schema: FACTCHECK_SCHEMA as unknown as Record<string, unknown>,
    purpose: "factcheck",
    onModel: (m) => { modelUsed = m; },
  });

  const findings: FactCheckFinding[] = Array.isArray(raw?.findings)
    ? raw.findings.map((f: any) => ({
        claim: String(f?.claim ?? ""),
        verdict: (["supported", "contested", "unsupported", "overclaimed"].includes(f?.verdict)
          ? f.verdict
          : "unsupported") as FactCheckFinding["verdict"],
        issue: String(f?.issue ?? ""),
        requiredFix: String(f?.required_fix ?? ""),
      }))
    : [];
  // Belt-and-braces: the boolean must agree with the findings. A model that
  // says pass=true while listing contested/unsupported findings is overruled.
  const blocking = findings.filter((f) => f.verdict === "contested" || f.verdict === "unsupported");
  const pass = Boolean(raw?.pass) && blocking.length === 0;
  return {
    pass,
    findings,
    fix: String(raw?.fix ?? (blocking[0]?.requiredFix ?? "")),
    promptVersion: PROMPT_VERSIONS.factcheck,
    input: { system: FACTCHECK_SYSTEM, user },
    rawOutput: raw,
    modelUsed,
  };
}
