// Automated production runs with a live verbose stream.
//
// The dashboard drives the whole pre-audio pipeline from an EDITABLE script:
// every doctrine check that can be decided in code or by the LLM runs
// automatically and narrates what it is doing, so the operator watches the
// reasoning instead of waiting on a silent spinner.
//
// Two hard boundaries survive the automation:
//   1. Steps that SPEND on narration/visuals never run automatically. The run
//      parks at an approval gate and waits (audio-first gate, PRODUCTION_DOCTRINE).
//   2. A failing check stops the run with the reason and the rule it violates.
//      Nothing is silently degraded to keep the pipeline moving (Rule 45).

import { randomUUID } from "node:crypto";
import type { LlmClient } from "./llm.js";
import { CAPTION_STYLE } from "./captions.js";
import {
  checkCaptionPlan,
  generateCaptionPlan,
  parsePlanText,
  planToText,
  tokenizeNarration,
  type CaptionCardInput,
} from "./captionPlan.js";

export type RunEventLevel = "info" | "step" | "pass" | "fail" | "warn" | "gate" | "done";

export interface RunEvent {
  seq: number;
  at: number;
  level: RunEventLevel;
  step: string;
  message: string;
  /** Rule/doctrine reference, always present on a fail so "why" is never lost. */
  rule?: string;
  data?: unknown;
}

export type RunStatus = "running" | "awaiting_approval" | "passed" | "failed";

export interface ProductionRun {
  id: string;
  status: RunStatus;
  script: string;
  title: string;
  createdAt: number;
  events: RunEvent[];
  /** Set when status is awaiting_approval — what the operator is being asked. */
  gate: { step: string; question: string; detail: string } | null;
  result: Record<string, unknown>;
  subscribers: Set<(e: RunEvent) => void>;
}

const runs = new Map<string, ProductionRun>();
/** Curio masters run 12-25s; a longer paste is a wrong paste, not a script. */
const MAX_SCRIPT_WORDS = 200;

export function getRun(id: string): ProductionRun | undefined {
  return runs.get(id);
}

export function listRuns(): ProductionRun[] {
  return [...runs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function emit(run: ProductionRun, level: RunEventLevel, step: string, message: string,
              extra: { rule?: string; data?: unknown } = {}) {
  const e: RunEvent = { seq: run.events.length, at: Date.now(), level, step, message, ...extra };
  run.events.push(e);
  for (const fn of run.subscribers) {
    try { fn(e); } catch { /* a dead SSE socket must not break the run */ }
  }
}

export function subscribe(run: ProductionRun, fn: (e: RunEvent) => void): () => void {
  run.subscribers.add(fn);
  return () => run.subscribers.delete(fn);
}

/** Resume a run parked at an approval gate. */
export function approveGate(run: ProductionRun, approved: boolean, note: string): boolean {
  if (run.status !== "awaiting_approval") return false;
  const gate = run.gate;
  run.gate = null;
  if (!approved) {
    emit(run, "fail", gate?.step ?? "gate", `Declined by operator${note ? `: ${note}` : ""}. Run stopped; nothing was spent.`);
    run.status = "failed";
    emit(run, "done", "run", "Run ended at the approval gate.");
    return true;
  }
  emit(run, "pass", gate?.step ?? "gate", `Approved by operator${note ? `: ${note}` : ""}.`);
  run.status = "passed";
  emit(run, "done", "run",
    "Pre-audio pipeline complete and approved. Narration is authorized; run the audio-story build, then the audio review gate.");
  return true;
}

const HEDGES = ["can", "could", "may", "might", "some", "most", "often", "tend", "tends",
  "usually", "generally", "typically", "roughly", "about", "nearly", "almost"];

export interface StartRunInput {
  script: string;
  title?: string;
  /** Measured WPM from the last real narration; drives the runtime budget. */
  measuredWpm?: number;
  targetSeconds?: number;
  /** Optional operator-authored caption plan; generated when absent. */
  planText?: string;
}

export function startRun(llm: LlmClient, input: StartRunInput): ProductionRun {
  const run: ProductionRun = {
    id: `run_${randomUUID().slice(0, 8)}`,
    status: "running",
    script: input.script.trim(),
    title: (input.title ?? "").trim() || "untitled production",
    createdAt: Date.now(),
    events: [],
    gate: null,
    result: {},
    subscribers: new Set(),
  };
  runs.set(run.id, run);
  // Detached on purpose: the HTTP response returns the id immediately and the
  // operator watches progress on the stream.
  void execute(run, llm, input);
  return run;
}

async function execute(run: ProductionRun, llm: LlmClient, input: StartRunInput) {
  const fail = (step: string, message: string, rule: string) => {
    emit(run, "fail", step, message, { rule });
    run.status = "failed";
    emit(run, "done", "run", "Run stopped. Nothing was spent and no artifact was written.");
  };

  try {
    emit(run, "info", "run", `Starting production run for "${run.title}".`);
    emit(run, "info", "run",
      `Model: ${llm.model}. Deterministic checks run in code; the model is used only where judgement is required.`);

    // ---- 1. script shape --------------------------------------------------
    emit(run, "step", "script", "Checking the script against the runtime and TTS contract…");
    const tokens = tokenizeNarration(run.script);
    const words = tokens.length;
    if (words < 2) return fail("script", "The script is empty or a single word — nothing to produce.", "script gate");
    if (words > MAX_SCRIPT_WORDS) {
      return fail("script",
        `The script has ${words} words. Curio masters run 12-25s (~30-75 spoken words, ceiling ${MAX_SCRIPT_WORDS}). This looks like the wrong text was pasted, so no tokens were spent on it.`,
        "Rule 43 (runtime locked first)");
    }
    emit(run, "info", "script", `${words} spoken words.`);

    if (/[—–]/.test(run.script)) {
      return fail("script",
        'The script contains an em/en dash. ElevenLabs can emit seconds of gibberish on a dash — use an ellipsis or a period.',
        "doctrine 11 (transcript-verify every TTS take)");
    }
    emit(run, "pass", "script", "No em dash in the TTS input.");

    const wpm = input.measuredWpm ?? 145;
    const target = input.targetSeconds ?? 18;
    const speech = (words / wpm) * 60;
    const projected = speech + 0.30;
    emit(run, "info", "script",
      `At the last measured ${wpm} WPM: ~${speech.toFixed(2)}s of speech, ~${projected.toFixed(2)}s with the mandatory 0.30s loop breath (target ${target}s).`);
    if (projected < 12 || projected > 25) {
      return fail("script",
        `Projected master ${projected.toFixed(2)}s falls outside the finalqa window of 12-25s. Re-cut the script by whole ideas — never by trimming the grammatical spine.`,
        "Rule 43 + Rule 50");
    }
    if (projected < 15 || projected > 20) {
      emit(run, "warn", "script",
        `Projected ${projected.toFixed(2)}s sits outside the GROWTH_OS 15-20s band, though inside the finalqa 12-25s window. Acceptable only if the story earns it.`,
        { rule: "GROWTH_OS §4" });
    } else {
      emit(run, "pass", "script", `Projected runtime ${projected.toFixed(2)}s is inside both the finalqa and GROWTH_OS windows.`);
    }
    emit(run, "info", "script",
      "This is an ESTIMATE. ElevenLabs WPM drifts with punctuation; the real delivery must be measured and the script re-cut if it misses.");

    // ---- 2. opening ------------------------------------------------------
    emit(run, "step", "opening", "Checking frame zero…");
    const firstStop = tokens.findIndex((t) => t.sentenceEnd);
    const openLen = firstStop === -1 ? tokens.length : firstStop + 1;
    const opening = tokens.slice(0, openLen).map((t) => t.raw).join(" ");
    emit(run, "info", "opening", `Opening sentence (${openLen} words): "${opening}"`);
    if (openLen > CAPTION_STYLE.maxWordsPerScreen) {
      emit(run, "warn", "opening",
        `The opening sentence is ${openLen} words but a caption screen holds ${CAPTION_STYLE.maxWordsPerScreen}. A complete-thought frame-zero card is impossible with this wording — fix it NOW, it cannot be fixed at the caption stage.`,
        { rule: "Rule 51 + Rule 52" });
    } else {
      emit(run, "pass", "opening", `The complete opening thought fits one ${CAPTION_STYLE.maxWordsPerScreen}-word screen.`);
    }
    if (openLen > 12) {
      emit(run, "warn", "opening", "The premise runs long; the playbook wants the contradiction stated in roughly 4-8 plain words.", { rule: "VIRAL_PLAYBOOK first-frame preflight" });
    }

    // ---- 3. hedges --------------------------------------------------------
    emit(run, "step", "qualifiers", "Scanning for factual qualifiers…");
    const found = HEDGES.filter((h) => new RegExp(`\\b${h}\\b`, "i").test(run.script));
    if (found.length) {
      emit(run, "pass", "qualifiers",
        `Hedges present and must survive to the captions verbatim: ${found.map((f) => `"${f}"`).join(", ")}. A caption may never be stronger than the VO.`,
        { rule: "Rule 44" });
    } else {
      emit(run, "warn", "qualifiers",
        "No hedging word found. If any claim in this script is not universally true, the source's qualifier is missing and that is a factual blocker.",
        { rule: "Rule 44" });
    }

    // ---- 4. caption plan --------------------------------------------------
    emit(run, "step", "captions", input.planText
      ? "Verifying the supplied caption plan against the script…"
      : "Asking the model for caption break points, then re-verifying every word in code…");
    let cards: CaptionCardInput[];
    if (input.planText && input.planText.trim()) {
      cards = parsePlanText(input.planText);
    } else {
      const gen = await generateCaptionPlan(llm, run.script);
      cards = gen.cards;
      emit(run, "info", "captions", `${gen.modelUsed} proposed a plan in ${gen.attempts} attempt(s).`);
    }
    const report = checkCaptionPlan(run.script, cards);
    for (const c of report.cards) {
      if (c.status === "fail") {
        emit(run, "fail", "captions", `Card "${c.display}" — ${c.problems.join(" | ")}`, { rule: "Rule 55.1 / Rule 44" });
      }
    }
    for (const p of report.plan_problems) emit(run, "fail", "captions", p, { rule: "Rule 55.1" });
    for (const w of report.warnings) emit(run, "warn", "captions", w, { rule: "Rule 51" });
    if (report.verdict !== "PASS") {
      return fail("captions",
        "The caption plan is not a verbatim grouping of the narration. Captions.ai transcribes the locked audio, so this plan cannot exist in the export.",
        "Rule 55.1");
    }
    run.result.planText = planToText(cards);
    run.result.cards = cards;
    emit(run, "pass", "captions",
      `All ${report.cards.length} cards are verbatim, in order, and inside the ${CAPTION_STYLE.maxWordsPerLine}-word line / ${CAPTION_STYLE.maxWordsPerScreen}-word screen limits.`);

    // ---- 5. audio-first gate ---------------------------------------------
    emit(run, "step", "gate", "Every check that can run without spending has passed.");
    emit(run, "gate", "gate",
      "Narration spend needs your approval: the audio-first gate blocks paid generation until a human authorizes it.",
      { rule: "PRODUCTION_DOCTRINE audio-first approval gate" });
    run.status = "awaiting_approval";
    run.gate = {
      step: "narration",
      question: "Authorize up to two continuous ElevenLabs v3 narration takes?",
      detail: `Script: ${words} words, projected ${projected.toFixed(2)}s. Caption plan verified. Nothing has been spent yet.`,
    };
    run.result.projectedSeconds = Number(projected.toFixed(3));
    run.result.words = words;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|insufficient_quota|quota/i.test(msg)) {
      return fail("run", "OpenAI quota is exhausted. Restore quota and re-run; nothing was persisted.", "provider error");
    }
    if (/401|invalid_api_key|incorrect api key/i.test(msg)) {
      return fail("run", "The OpenAI API key was rejected (401). Fix OPENAI_API_KEY and restart the server.", "provider error");
    }
    if (/timeout|abort/i.test(msg)) {
      return fail("run", "The model did not return a valid strict-schema response before the timeout. Nothing was persisted.", "provider error");
    }
    return fail("run", `Unexpected error: ${msg}`, "internal");
  }
}
