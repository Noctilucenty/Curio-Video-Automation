/**
 * Autopilot state machine.
 *
 * The whole point of this file is that a production is a SEQUENCE OF DURABLE STAGES,
 * not one long function. Every stage boundary is a place where the process can die —
 * Render deploys, worker restarts, OOM kills — and resume without repeating a paid
 * call. So the ordering lives in data, not in control flow.
 */

/** Stages in execution order. Index in this array IS the progression. */
export const STAGES = [
  "LOADING_CANONICAL_CONTEXT",
  "DISCOVERING_TOPICS",
  "SCORING_TOPICS",
  "FACT_CHECKING",
  "SCRIPTING",
  "SCRIPT_SELF_REVIEW",
  "GENERATING_NARRATION",
  "NARRATION_QA",
  "BUILDING_AUDIO_STORY",
  "AUDIO_LOOP_QA",
  "PLANNING_VISUALS",
  "SOURCING_OR_GENERATING_VISUALS",
  "ASSEMBLING",
  "CREATIVE_SELF_REVIEW",
  "CORRECTING",
  "CAPTIONING",
  "FINAL_QA",
] as const;

export type Stage = (typeof STAGES)[number];

/** Terminal / interruption states — a run sits in one of these when not progressing. */
export const TERMINAL_STATES = [
  "READY_FOR_REVIEW",
  "PAUSED",
  "CANCELLED",
  "FAILED",
  "BLOCKED_CREDENTIAL",
  "BLOCKED_BUDGET",
  "BLOCKED_LICENSE",
  "BLOCKED_CAPTIONS_AUTH",
] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];
export type RunState = "QUEUED" | Stage | TerminalState;

/** Blocked states are resumable once the human clears the underlying cause. */
export const BLOCKED_STATES = [
  "BLOCKED_CREDENTIAL",
  "BLOCKED_BUDGET",
  "BLOCKED_LICENSE",
  "BLOCKED_CAPTIONS_AUTH",
] as const satisfies readonly TerminalState[];

export function isBlocked(s: RunState): boolean {
  return (BLOCKED_STATES as readonly string[]).includes(s);
}

export function isTerminal(s: RunState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(s);
}

/** A run in one of these can never be advanced by a worker again without human action. */
export function isFinished(s: RunState): boolean {
  return s === "READY_FOR_REVIEW" || s === "CANCELLED" || s === "FAILED";
}

/**
 * Next stage after `current`.
 *
 * CORRECTING is conditional: the creative self-review decides whether it runs at all,
 * so the happy path skips straight from CREATIVE_SELF_REVIEW to CAPTIONING. Returning
 * null means "the run is complete" -> READY_FOR_REVIEW.
 */
export function nextStage(current: Stage, opts?: { needsCorrection?: boolean }): Stage | null {
  if (current === "CREATIVE_SELF_REVIEW" && !opts?.needsCorrection) return "CAPTIONING";
  const i = STAGES.indexOf(current);
  if (i < 0 || i === STAGES.length - 1) return null;
  return STAGES[i + 1];
}

export function firstStage(): Stage {
  return STAGES[0];
}

/** 0..1 progress for the dashboard. Terminal states report a settled value. */
export function progressOf(state: RunState): number {
  if (state === "QUEUED") return 0;
  if (state === "READY_FOR_REVIEW") return 1;
  const i = STAGES.indexOf(state as Stage);
  if (i >= 0) return (i + 1) / (STAGES.length + 1);
  return 0; // blocked/paused/cancelled/failed — the UI shows the reason, not a bar
}

/**
 * Stages that may spend money. Used to enforce two invariants BEFORE the stage runs:
 *   1. dry-run must never enter one
 *   2. the budget check must happen at the boundary, not inside provider code
 */
export const PAID_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  "DISCOVERING_TOPICS",   // YouTube Data API quota
  "FACT_CHECKING",
  "SCRIPTING",
  "SCRIPT_SELF_REVIEW",
  "GENERATING_NARRATION",
  "NARRATION_QA",
  "SOURCING_OR_GENERATING_VISUALS",
  "CREATIVE_SELF_REVIEW",
  "CORRECTING",
  "CAPTIONING",
]);

export function isPaidStage(s: Stage): boolean {
  return PAID_STAGES.has(s);
}

/** Human-facing labels for the dashboard. */
export const STAGE_LABELS: Record<Stage, string> = {
  LOADING_CANONICAL_CONTEXT: "Loading canonical doctrine",
  DISCOVERING_TOPICS: "Discovering topic candidates",
  SCORING_TOPICS: "Scoring and choosing a topic",
  FACT_CHECKING: "Fact-checking claims",
  SCRIPTING: "Writing the script",
  SCRIPT_SELF_REVIEW: "Hostile script self-review",
  GENERATING_NARRATION: "Generating narration takes",
  NARRATION_QA: "Transcript QA and take selection",
  BUILDING_AUDIO_STORY: "Building the audio story",
  AUDIO_LOOP_QA: "Verifying the semantic audio loop",
  PLANNING_VISUALS: "Planning shots",
  SOURCING_OR_GENERATING_VISUALS: "Sourcing / generating visuals",
  ASSEMBLING: "Assembling the video",
  CREATIVE_SELF_REVIEW: "Hostile cold-viewer review",
  CORRECTING: "Applying correction pass",
  CAPTIONING: "Captions.ai",
  FINAL_QA: "Final technical + creative QA",
};

/** Actionable blocker copy — the dashboard shows exactly what a human must do. */
export const BLOCKER_HELP: Record<string, string> = {
  BLOCKED_CREDENTIAL:
    "A required provider credential is missing. Add it in Render → Environment, then Resume.",
  BLOCKED_BUDGET:
    "The run reached its spend cap before finishing. Raise the budget and Resume, or Cancel.",
  BLOCKED_LICENSE:
    "No usable licensed footage was found and synthetic generation is disabled for this run. " +
    "Authorise a stock purchase or enable a generation provider, then Resume.",
  BLOCKED_CAPTIONS_AUTH:
    "Captions.ai could not be driven unattended. Complete the captioning step in the " +
    "Captions.ai web app, attach the exported file, then Resume.",
};
