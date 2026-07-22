// Caption-plan contract: Captions.ai derives caption cards from ASR of the
// LOCKED audio, so a caption plan is only valid when it is the narration's
// exact words, in order, grouped — never a paraphrase. These checks are
// deterministic and live in CODE (CLAUDE.md: loudness/schema/caption limits
// never go to a model). The LLM's only job here is choosing GOOD break points;
// every proposal is re-verified by checkCaptionPlan before it is returned, and
// a non-compliant proposal fails loudly with the exact reasons.
//
// Rule sources: PRODUCTION_DOCTRINE Rule 55.1 (word-for-word transcript vs
// locked script), Rule 44 (a caption may never be stronger than the VO —
// qualifiers preserved), Rule 51 (opening caption is a complete thought),
// doctrine 34 (≤6 words / ≤2 lines per screen), GROWTH_OS §4 (2–4 words per
// line, no one-word karaoke/orphans).

import { CAPTION_STYLE } from "./captions.js";
import type { JsonRequest, LlmClient } from "./llm.js";

export interface CaptionCardInput {
  /** 1–2 caption lines shown together as one card. */
  lines: string[];
}

export interface CardReport {
  index: number;
  display: string;
  status: "pass" | "fail";
  problems: string[];
}

export interface CaptionPlanReport {
  verdict: "PASS" | "FAIL";
  cards: CardReport[];
  plan_problems: string[];
  warnings: string[];
  rules_checked: string[];
}

export const CAPTION_PLAN_RULES = [
  "Word-for-word match with the locked narration — Captions.ai builds cards from ASR of the locked audio, so caption text that is not the narration's exact words cannot exist in the export (PRODUCTION_DOCTRINE Rule 55.1).",
  "Full coverage in order — every spoken word appears exactly once, and no card skips ahead.",
  "Qualifiers preserved — a caption may never be stronger than the VO; dropping 'can'/'tend'/'some' is a factual blocker, not a style choice (Rule 44).",
  `2–4 words per line; a one-word line is an orphan (GROWTH_OS §4).`,
  `Max ${CAPTION_STYLE.maxLinesPerScreen} lines and ${CAPTION_STYLE.maxWordsPerScreen} words on screen at once (doctrine 34, LOCKED).`,
  "The opening card is a complete thought on frame zero when the opening sentence allows it (Rule 51).",
] as const;

/** Words whose loss changes a claim's strength (Rule 44's hedge list). */
const QUALIFIERS = new Set([
  "can", "could", "may", "might", "some", "most", "often", "tend", "tends",
  "nearly", "almost", "barely", "usually", "generally", "typically", "rarely",
  "roughly", "about", "approximately", "sometimes",
]);

interface Token {
  norm: string;
  raw: string;
  /** True when the raw word ends a sentence in the narration. */
  sentenceEnd: boolean;
}

/** Normalize one whitespace word; "" when it has no letter/digit (bare dash). */
function normWord(raw: string): string {
  const norm = raw.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9'-]/g, "");
  return /[a-z0-9]/.test(norm) ? norm : "";
}

export function tokenizeNarration(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({
      raw,
      norm: normWord(raw),
      sentenceEnd: /[.!?…]["')]*$/.test(raw),
    }))
    .filter((t) => t.norm.length > 0);
}

function tokenizeCard(card: CaptionCardInput): string[] {
  return card.lines
    .join(" ")
    .split(/\s+/)
    .map(normWord)
    .filter(Boolean);
}

/** Real words in a caption line — punctuation-only "words" don't count. */
function lineWordCount(line: string): number {
  return line.split(/\s+/).map(normWord).filter(Boolean).length;
}

function cardDisplay(card: CaptionCardInput): string {
  return card.lines.map((l) => l.trim().toUpperCase()).filter(Boolean).join(" / ");
}

function findSubarray(haystack: Token[], needle: string[], from: number): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j].norm !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Verify a caption plan against the locked narration. Deterministic; every
 * failure carries the reason and the rule it violates, because a bare "fail"
 * teaches the operator nothing.
 */
export function checkCaptionPlan(script: string, cards: CaptionCardInput[]): CaptionPlanReport {
  const scriptTokens = tokenizeNarration(script);
  const cardReports: CardReport[] = [];
  const planProblems: string[] = [];
  const warnings: string[] = [];

  if (scriptTokens.length === 0) {
    planProblems.push("the locked narration script is empty — nothing to verify against");
  }
  if (cards.length === 0) {
    planProblems.push("the caption plan has no cards");
  }

  let cursor = 0;
  // After a paraphrased card the cursor position is a guess. Remember where
  // the drift began so the next clean card can re-anchor from there silently
  // instead of being blamed for the earlier card's failure.
  let resyncFrom: number | null = null;
  cards.forEach((card, index) => {
    const problems: string[] = [];
    const lines = card.lines.map((l) => l.trim()).filter(Boolean);
    const display = cardDisplay(card) || "(empty card)";

    if (lines.length === 0) {
      problems.push("empty card — remove it or give it 1–2 lines");
    }
    if (lines.length > CAPTION_STYLE.maxLinesPerScreen) {
      problems.push(
        `${lines.length} lines on one card — a screen holds at most ${CAPTION_STYLE.maxLinesPerScreen} (doctrine 34)`,
      );
    }
    for (const line of lines) {
      const n = lineWordCount(line);
      if (n > CAPTION_STYLE.maxWordsPerLine) {
        problems.push(
          `line "${line}" has ${n} words — the generated-line ceiling is ${CAPTION_STYLE.maxWordsPerLine} (GROWTH_OS §4)`,
        );
      }
      if (n === 1) {
        problems.push(
          `line "${line}" is a one-word orphan — no one-word karaoke; regroup it with its clause (GROWTH_OS §4)`,
        );
      }
    }
    const cardTokens = tokenizeCard(card);
    if (cardTokens.length > CAPTION_STYLE.maxWordsPerScreen) {
      problems.push(
        `${cardTokens.length} words on one screen — the LOCKED ceiling is ${CAPTION_STYLE.maxWordsPerScreen} (doctrine 34)`,
      );
    }

    // --- Verbatim alignment against the narration ---------------------------
    if (cardTokens.length > 0 && scriptTokens.length > 0) {
      const window = scriptTokens.slice(cursor, cursor + cardTokens.length);
      const matches = window.length === cardTokens.length
        && window.every((t, i) => t.norm === cardTokens[i]);

      const reAnchor = !matches && resyncFrom !== null
        ? findSubarray(scriptTokens, cardTokens, resyncFrom)
        : -1;
      if (matches) {
        cursor += cardTokens.length;
        resyncFrom = null;
      } else if (reAnchor >= 0) {
        // Re-anchor on the first clean match after an earlier paraphrase —
        // the gap belongs to that card's failure, not to this one.
        cursor = reAnchor + cardTokens.length;
        resyncFrom = null;
      } else {
        // Diagnose precisely: skipped narration words, or a true paraphrase.
        const resync = findSubarray(scriptTokens, cardTokens, cursor);
        if (resync >= 0) {
          const skipped = scriptTokens.slice(cursor, resync).map((t) => t.raw).join(" ");
          problems.push(
            `card matches the narration only after skipping "${skipped}" — every spoken word must appear in a card, in order (Rule 55.1): Captions.ai will render the skipped words whether the plan includes them or not`,
          );
          const droppedQualifiers = scriptTokens
            .slice(cursor, resync)
            .filter((t) => QUALIFIERS.has(t.norm))
            .map((t) => t.norm);
          if (droppedQualifiers.length) {
            problems.push(
              `the skipped words include the qualifier(s) ${droppedQualifiers.map((q) => `"${q}"`).join(", ")} — dropping a hedge makes the caption STRONGER than the VO, a factual blocker (Rule 44)`,
            );
          }
          cursor = resync + cardTokens.length;
          resyncFrom = null;
        } else {
          let d = 0;
          while (d < cardTokens.length && d < window.length && window[d].norm === cardTokens[d]) d++;
          const expected = window[d]?.raw ?? "(end of narration)";
          const got = cardTokens[d] ?? "(nothing)";
          problems.push(
            `word ${d + 1} of this card is "${got}" but the narration says "${expected}" at this point — captions must be the narration's exact words, never a paraphrase (Rule 55.1): Captions.ai transcribes the locked audio, so this wording cannot survive the word-for-word diff`,
          );
          const expectedNorm = window[d]?.norm;
          if (expectedNorm && QUALIFIERS.has(expectedNorm) && !cardTokens.includes(expectedNorm)) {
            problems.push(
              `the replaced narration word "${expectedNorm}" is a qualifier — losing it makes the caption STRONGER than the VO (Rule 44)`,
            );
          }
          // Best-effort resync so later cards still get meaningful checks;
          // remember where the drift began for the next card's re-anchor.
          resyncFrom = cursor;
          cursor = Math.min(cursor + cardTokens.length, scriptTokens.length);
        }
      }
    }

    // --- Frame-zero complete thought (Rule 51) ------------------------------
    if (index === 0 && cardTokens.length > 0 && scriptTokens.length > 0) {
      const firstSentenceEnd = scriptTokens.findIndex((t) => t.sentenceEnd);
      const firstSentenceLen = firstSentenceEnd === -1 ? scriptTokens.length : firstSentenceEnd + 1;
      if (firstSentenceLen <= CAPTION_STYLE.maxWordsPerScreen && cardTokens.length < firstSentenceLen) {
        problems.push(
          `the opening card stops after ${cardTokens.length} of the opening sentence's ${firstSentenceLen} words — the frame-zero caption must be the complete thought, and the full sentence fits the ${CAPTION_STYLE.maxWordsPerScreen}-word screen (Rule 51)`,
        );
      }
      if (firstSentenceLen > CAPTION_STYLE.maxWordsPerScreen) {
        warnings.push(
          `the opening sentence has ${firstSentenceLen} words — more than one screen can hold (${CAPTION_STYLE.maxWordsPerScreen}), so a complete-thought frame-zero card is impossible with this narration; shorten the opening sentence before locking audio (Rule 51 risk — this cannot be fixed at the caption stage)`,
        );
      }
    }

    cardReports.push({
      index,
      display,
      status: problems.length ? "fail" : "pass",
      problems,
    });
  });

  if (scriptTokens.length > 0 && cursor < scriptTokens.length) {
    const remaining = scriptTokens.slice(cursor).map((t) => t.raw).join(" ");
    planProblems.push(
      `the caption plan ends before the narration does — uncovered narration: "${remaining}" (Rule 55.1: Captions.ai will caption these spoken words whether the plan includes them or not)`,
    );
  }

  const verdict = planProblems.length || cardReports.some((c) => c.status === "fail") ? "FAIL" : "PASS";
  return {
    verdict,
    cards: cardReports,
    plan_problems: planProblems,
    warnings,
    rules_checked: [...CAPTION_PLAN_RULES],
  };
}

/**
 * Parse the human-editable plan format used in briefs and the dashboard:
 * one card per line, " / " separating a card's two lines.
 */
export function parsePlanText(planText: string): CaptionCardInput[] {
  return planText
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => ({ lines: row.split("/").map((l) => l.trim()).filter(Boolean) }))
    .filter((card) => card.lines.length > 0); // a row of just "/" is noise, not a card
}

export function planToText(cards: CaptionCardInput[]): string {
  return cards.map((c) => cardDisplay(c)).join("\n");
}

// ---------------------------------------------------------------------------
// LLM-backed plan generation. The model only chooses break points; the words
// are fixed by the narration and the result is re-verified in code.
// ---------------------------------------------------------------------------

export const CAPTION_PLAN_SCHEMA_NAME = "curio_caption_plan";
export const CAPTION_PLAN_PROMPT_VERSION = "caption_plan_v1_verbatim_grouping";

/** Curio masters run 12–25s (~30–75 spoken words). A "script" far beyond that
 * is almost certainly a wrong paste, and it would spend LLM tokens on it. */
const MAX_SCRIPT_WORDS = 200;

export const CAPTION_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lines"],
        properties: {
          lines: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export class CaptionPlanError extends Error {
  constructor(message: string, public readonly issues: string[]) {
    super(message);
    this.name = "CaptionPlanError";
  }
}

function captionPlanSystemPrompt(): string {
  return [
    "You segment a LOCKED narration script into caption cards for Captions.ai.",
    "HARD CONTRACT — violations are rejected by a deterministic verifier:",
    "1. Use ONLY the narration's exact words, every word exactly once, in the original order. Never paraphrase, add, drop, substitute, or reorder a single word. Omit punctuation; capitalization is free (cards render uppercase).",
    `2. A card has 1 or 2 lines. Every line has 2–${CAPTION_STYLE.maxWordsPerLine} words — a one-word line is a forbidden orphan. A card never exceeds ${CAPTION_STYLE.maxWordsPerScreen} words total.`,
    "3. Break at clause and sentence boundaries so each card reads as one thought. Never separate a qualifier (can, tend, some, most, often...) from the word it modifies.",
    `4. The FIRST card must contain the complete opening sentence whenever that sentence is ${CAPTION_STYLE.maxWordsPerScreen} words or fewer — the frame-zero caption is a complete thought.`,
    "Return JSON only, matching the schema.",
  ].join("\n");
}

export interface GeneratedCaptionPlan {
  cards: CaptionCardInput[];
  planText: string;
  report: CaptionPlanReport;
  modelUsed: string;
  attempts: number;
}

const MAX_PLAN_ATTEMPTS = 2;

export async function generateCaptionPlan(llm: LlmClient, script: string): Promise<GeneratedCaptionPlan> {
  const trimmed = script.trim();
  if (!trimmed) throw new CaptionPlanError("narration script is required", ["script must not be empty"]);
  const wordCount = tokenizeNarration(trimmed).length;
  if (wordCount < 2) {
    throw new CaptionPlanError("narration script is too short to caption", [
      "the script has fewer than two words — captions need a real narration",
    ]);
  }
  if (wordCount > MAX_SCRIPT_WORDS) {
    throw new CaptionPlanError("narration script is implausibly long for a Curio master", [
      `the script has ${wordCount} words; Curio masters run 12–25s (~30–75 spoken words, hard ceiling ${MAX_SCRIPT_WORDS}) — this looks like the wrong text was pasted, so no tokens were spent on it`,
    ]);
  }

  let modelUsed = llm.model;
  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    const feedback = attempt === 1
      ? ""
      : `\n\nYour previous plan FAILED verification. Fix exactly these problems and change nothing else:\n- ${lastIssues.join("\n- ")}`;
    const req: JsonRequest = {
      system: captionPlanSystemPrompt(),
      user: `Locked narration script:\n"""\n${trimmed}\n"""${feedback}`,
      schemaName: CAPTION_PLAN_SCHEMA_NAME,
      schema: CAPTION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      purpose: "package",
      onModel: (m) => { modelUsed = m; },
    };
    const raw = (await llm.generateJson(req)) as { cards?: Array<{ lines?: unknown }> };
    const cards: CaptionCardInput[] = (raw.cards ?? []).map((c) => ({
      lines: Array.isArray(c.lines) ? c.lines.map((l) => String(l)) : [],
    }));
    const report = checkCaptionPlan(trimmed, cards);
    if (report.verdict === "PASS") {
      return { cards, planText: planToText(cards), report, modelUsed, attempts: attempt };
    }
    lastIssues = [
      ...report.plan_problems,
      ...report.cards.flatMap((c) => c.problems.map((p) => `card ${c.index + 1} ("${c.display}"): ${p}`)),
    ];
  }
  throw new CaptionPlanError(
    `the model could not produce a contract-compliant caption plan in ${MAX_PLAN_ATTEMPTS} attempts — nothing was persisted; the exact verification failures are listed`,
    lastIssues,
  );
}

/**
 * Deterministic compliant grouping used by the offline mock (and available as
 * a non-LLM fallback the operator can call explicitly — never silently).
 * Groups each sentence into 2–4 word lines, pairing lines into a card when the
 * whole sentence fits one screen.
 */
export function deterministicCaptionCards(script: string): CaptionCardInput[] {
  const tokens = tokenizeNarration(script);
  const sentences: Token[][] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    current.push(t);
    if (t.sentenceEnd) { sentences.push(current); current = []; }
  }
  if (current.length) sentences.push(current);

  // A one-word sentence ("Silence.") can never be a legal card on its own.
  // Merge it into a neighboring sentence's word stream BEFORE chunking so the
  // chunker rebalances the lines itself and no orphan can arise.
  const wordGroups: string[][] = sentences.map((sentence) =>
    sentence.map((t) => t.raw.replace(/[.,;:!?…"]+$/g, "").replace(/^["']+/g, "")),
  );
  for (let i = 0; i < wordGroups.length; i++) {
    if (wordGroups[i].length !== 1) continue;
    if (i + 1 < wordGroups.length) {
      wordGroups[i + 1].unshift(wordGroups[i][0]);
    } else if (i > 0) {
      wordGroups[i - 1].push(wordGroups[i][0]);
    } else {
      continue; // a one-word script — nothing to merge with
    }
    wordGroups.splice(i, 1);
    i--;
  }

  const cards: CaptionCardInput[] = [];
  for (const words of wordGroups) {
    const chunks = chunkWords(words);
    if (chunks.length === 2 && words.length <= CAPTION_STYLE.maxWordsPerScreen) {
      cards.push({ lines: chunks });
    } else {
      for (const chunk of chunks) cards.push({ lines: [chunk] });
    }
  }
  return cards;
}

/** Split a sentence's words into 2–4 word chunks with no 1-word remainder. */
function chunkWords(words: string[]): string[] {
  const max = CAPTION_STYLE.maxWordsPerLine;
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    let take = Math.min(max, words.length - i);
    const remainderAfter = words.length - i - take;
    if (remainderAfter === 1) take -= 1; // never strand a single word
    if (take < 1) take = 1;
    chunks.push(words.slice(i, i + take).join(" "));
    i += take;
  }
  return chunks;
}
