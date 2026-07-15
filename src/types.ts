// Domain types for the Curio video automation pipeline.
// OpenAI is the brain (script/captions/judging/learning), HeyGen only renders,
// the repo is the memory, and platform analytics are the feedback signal.

export type Platform = "tiktok" | "reels" | "shorts";

export type VideoStatus =
  | "draft"
  | "generated"
  | "needs_revision"
  | "ready_for_review"
  | "approved"
  | "published"
  | "rejected"
  | "failed";

export interface Topic {
  id: string;
  topic: string;
  category: string;
  targetPlatform: Platform;
  tone: string;
  targetLengthSeconds: number;
  language: string;
  /** Optional Curio card / source reference. */
  sourceRef?: string;
  /** "card" = 4-6s static read-a-card short; default "narrated". */
  format?: "narrated" | "card";
  status: "queued" | "used" | "archived";
  createdAt: number;
}

export interface CaptionLine {
  startHint: number;
  endHint: number;
  text: string;
  /** The one highlighted phrase; must be a substring of text. */
  emphasis: string;
  position: "lower_center" | "upper_center" | "middle";
  style: "curio_premium";
}

/** The full structured package OpenAI produces per video — never just "captions". */
/** The ONE viewer action a video is designed to produce. Optimizing for all
 * of them at once stacks tactics until the video feels manipulative, dense,
 * and confusing — Leon's doctrine (2026-07-12): low cognitive load, one
 * primary outcome, at most one secondary. Curio default: retention primary,
 * shares secondary. */
export type ViewerOutcome = "retention" | "shares" | "saves" | "comments" | "likes";

export interface VideoPackage {
  topic: string;
  category: string;
  targetPlatform: Platform;
  hookOptions: string[];
  selectedHook: string;
  script: string;
  sceneDirection: string;
  avatarTone: string;
  captionLines: CaptionLine[];
  title: string;
  thumbnailText: string;
  postCaption: string;
  hashtags: string[];
  cta: string;
  estimatedLengthSeconds: number;
  /** Optional only for packages stored before 2026-07-12 — the generator
   * schema requires all three on every new package. */
  primaryOutcome?: ViewerOutcome;
  secondaryOutcome?: ViewerOutcome;
  /** The exact beat/line engineered to produce the primary outcome — a
   * concrete moment ("the reveal at ~11s: 'The horizon is lying'"), never a
   * vague claim like "this creates curiosity". */
  outcomeMoment?: string;
}

export interface JudgeScores {
  hookScore: number;
  retentionScore: number;
  clarityScore: number;
  captionReadability: number;
  brandFit: number;
  viralPotential: number;
  factualSafety: number;
  overallScore: number;
  /** MACHINE-ENFORCED verdict on the one-outcome design: false blocks
   * publication in meetsThresholds regardless of the numeric scores — the
   * model voluntarily lowering viral_potential is not trusted. Optional only
   * for scores stored before 2026-07-12 (never re-gated at runtime). */
  outcomeVerified?: boolean;
  /** The judge's justification: names the intended primary outcome and the
   * exact moment that produces it (or what's missing). */
  outcomeCheck?: string;
  problems: string[];
  fix: string;
  pass: boolean;
}

export interface RenderInfo {
  provider: "heygen" | "mock" | "local";
  status: "not_started" | "rendering" | "completed" | "failed";
  providerVideoId?: string;
  videoUrl?: string;
  error?: string;
}

/** ElevenLabs narration step (HeyGen only lip-syncs to this audio). */
export interface AudioInfo {
  provider: "elevenlabs" | "mock";
  status: "not_started" | "completed" | "failed";
  voiceId?: string;
  /** HeyGen asset id the narration was uploaded as. */
  assetId?: string;
  error?: string;
}

/** Post step: burned captions (+ cuts when an external editor is used).
 * "builtin" = the local renderer burned captions itself; nothing to cut
 * because a verbatim TTS read has no fillers or dead silences. */
export interface PostInfo {
  provider: "captions_ai" | "mirage" | "mock" | "builtin";
  status: "not_started" | "processing" | "completed" | "failed";
  /** Final deliverable URL (captioned + cleaned). Publish THIS, not render.videoUrl. */
  videoUrl?: string;
  /** The RESOLVED operations that actually ran, persisted with the result.
   * `policy` records the timeline contract the job was resolved under so a
   * reviewer can see, after the fact, that a locked master was never trimmed. */
  operations?: {
    captions: boolean;
    cutFillers: boolean;
    cutSilences: boolean;
    policy?: "locked_master" | "raw_spoken";
  };
  error?: string;
}

export interface Video {
  id: string;
  topicId?: string;
  status: VideoStatus;
  pkg?: VideoPackage;
  judge?: JudgeScores;
  /** Generation attempts consumed (1 initial + up to 2 auto-regens). */
  attempts: number;
  generationIds: string[];
  /** Active generator rule ids at package-generation time — the cohort key for
   * "did this rule actually improve performance?" in later learning runs. */
  appliedRuleIds?: string[];
  /** Copied from the topic at draft time; decides the render path. */
  format?: "narrated" | "card";
  render: RenderInfo;
  audio?: AudioInfo;
  post?: PostInfo;
  error?: string;
  /** Human reviewer note (reject reason, edit note). */
  reviewNote?: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

/** Every OpenAI call is recorded for prompt A/B testing and future fine-tune data. */
export interface GenerationRecord {
  id: string;
  videoId: string;
  kind: "package" | "judge" | "factcheck" | "learning" | "ingest";
  promptVersion: string;
  /** The EXACT model id the API returned (snapshot), not the request alias —
   * required so silent model updates never become untracked experiment variables. */
  model: string;
  input: unknown;
  output: unknown;
  createdAt: number;
}

export interface PerformanceMetrics {
  id: string;
  videoId: string;
  platform: Platform;
  /** Exact distribution surface. IG and FB both canonicalize to platform
   * "reels", but combined IG+FB views are NOT a valid optimization target
   * (2026-07-12 analysis: FB supplied most views on 3/4 posts while the
   * engagement rates were IG signals) — surface-separated rows are mandatory
   * for learning. */
  surface?: "instagram" | "facebook" | "tiktok" | "youtube";
  /** Accounts reached on this surface, when the platform reports it. */
  reach?: number;
  /** "real" = actual platform analytics; "synthetic" = dev/mock-era rows.
   * Learning runs EXCLUDE synthetic rows — fake high-view examples must never
   * shape permanent rules. All live ingestion paths tag "real". */
  provenance?: "real" | "synthetic";
  views: number;
  avgWatchTime: number;
  completionRate: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  profileClicks: number;
  /** First-seconds skip rate 0-1 when the platform reports it. */
  skipRate?: number;
  appDownloads?: number;
  postedAt: number;
  ingestedAt: number;
}

/**
 * "calibration" rules are special: they tune the JUDGE (predicted vs actual
 * performance), not the generator. All other categories steer generation.
 */
export interface LearningRule {
  id: string;
  category: "hook" | "caption" | "topic" | "structure" | "tone" | "length" | "calibration";
  rule: string;
  source: "seed" | "learning_run" | "manual";
  active: boolean;
  runId?: string;
  createdAt: number;
}

export interface LearningRun {
  id: string;
  analyzedVideos: number;
  topPatterns: string[];
  weakPatterns: string[];
  hookFormulas: string[];
  recommendedTopics: string[];
  captionRecommendations: string[];
  /** Per-platform lessons, e.g. "instagram: cut to 12s, IG punishes cognitive load". */
  platformNotes: string[];
  /** Where the pre-publish judge over/under-predicted real performance. */
  judgeCalibrationNotes: string[];
  bestLengthSeconds?: number;
  bestCategories: string[];
  bestTone?: string;
  newRuleIds: string[];
  /** Avg engagement of videos posted after the previous run minus before — is the loop working? */
  improvementDelta?: number;
  previousRunId?: string;
  promptVersion: string;
  model: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Status machine. Transitions outside this map are bugs (or bad API calls) and
// are rejected with 409 so the review queue can never reach a nonsense state.
// ---------------------------------------------------------------------------

export const STATUS_TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
  draft: ["generated", "failed"],
  generated: ["ready_for_review", "needs_revision", "failed"],
  needs_revision: ["generated", "rejected", "failed"],
  ready_for_review: ["approved", "rejected", "needs_revision", "failed"],
  approved: ["published", "rejected"],
  published: [],
  rejected: ["needs_revision"],
  failed: ["needs_revision"],
};

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export class TransitionError extends Error {
  constructor(public from: VideoStatus, public to: VideoStatus) {
    super(`invalid status transition: ${from} -> ${to}`);
  }
}

export function assertTransition(from: VideoStatus, to: VideoStatus): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}
