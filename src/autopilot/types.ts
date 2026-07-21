/**
 * Autopilot domain types.
 *
 * Deliberately separate from src/types.ts: a Video is the ARTEFACT, a Run is the
 * PROCESS that produces one. Keeping them apart means the existing status machine
 * (draft -> generated -> ready_for_review ...) stays untouched and keeps passing its
 * tests, while the control plane gets state it actually needs (leases, spend, blockers).
 */
import type { RunState, Stage } from "./states.js";

export interface RunConfig {
  platforms: Array<"reels" | "shorts">;
  targetRuntime: { minSeconds: number; maxSeconds: number };
  maxSpendUsd: number;
  category: string | "auto";
  factualRisk: "strict" | "normal";
  /** Ordered preference. Veo is absent unless explicitly allowed. */
  visualPolicy: "real_first" | "gpt_image_ok" | "veo_allowed";
  allowPaidStock: boolean;
  allowVeo: boolean;
  maxImageCalls: number;
  maxVideoCalls: number;
  qualityProfile: "standard" | "premium";
  dryRun: boolean;
  maxCorrectionPasses: number;
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  platforms: ["reels"],
  targetRuntime: { minSeconds: 14.5, maxSeconds: 20 },
  maxSpendUsd: 8,
  category: "auto",
  factualRisk: "strict",
  // Doctrine default: real/licensed first. Veo is OFF unless a run opts in, because
  // "the budget permits it" is not a reason to generate video (CLAUDE.md hard rule).
  visualPolicy: "real_first",
  allowPaidStock: false,
  allowVeo: false,
  maxImageCalls: 8,
  maxVideoCalls: 0,
  qualityProfile: "premium",
  dryRun: false,
  maxCorrectionPasses: 1,
};

export interface Run {
  id: string;
  idempotencyKey: string | null;
  state: RunState;
  config: RunConfig;
  topicId?: string | null;
  topicTitle?: string | null;
  budgetUsd: number;
  spentUsd: number;
  dryRun: boolean;
  correctionPasses: number;
  blockerCode?: string | null;
  blockerDetail?: string | null;
  error?: string | null;
  cancelRequested: boolean;
  pauseRequested: boolean;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface StageRow {
  runId: string;
  stage: Stage;
  status: StageStatus;
  attempt: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  heartbeatAt?: number | null;
  output?: unknown;
  error?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export interface ProviderCall {
  id?: number;
  runId: string;
  stage: Stage;
  provider: string;
  model?: string | null;
  /** UNIQUE. The duplicate-spend guard — see store.recordProviderCall. */
  dedupeKey: string;
  operationId?: string | null;
  status: "started" | "succeeded" | "failed";
  attempt: number;
  prompt?: string | null;
  reason?: string | null;
  estimatedUsd: number;
  actualUsd?: number | null;
  responseMeta?: unknown;
  verdict?: "used" | "rejected" | null;
  createdAt: number;
}

export interface Artifact {
  id?: number;
  runId: string;
  stage: Stage | string;
  kind: string;
  storageKey: string;
  storageDriver: string;
  mimeType?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  width?: number | null;
  height?: number | null;
  durationS?: number | null;
  /** How it was made — drives the mandatory AI-disclosure log on delivery. */
  provenance?: {
    kind: "real_footage" | "licensed_stock" | "gpt_image" | "veo" | "local_render" | "audio";
    provider?: string;
    license?: string;
    synthetic: boolean;
  } | null;
  lineage?: unknown;
  createdAt: number;
}

export interface RunEvent {
  runId: string;
  seq: number;
  level: "info" | "warn" | "error";
  stage?: Stage | null;
  message: string;
  data?: unknown;
  createdAt: number;
}

export interface TopicCandidate {
  runId: string;
  title: string;
  angle?: string;
  category?: string;
  source: string;
  evidence?: unknown;
  scores?: Record<string, number>;
  penalties?: Record<string, number>;
  totalScore: number;
  chosen: boolean;
  rejectReason?: string | null;
}

export interface Claim {
  runId: string;
  claim: string;
  sourceUrl?: string | null;
  sourceType?: string | null;
  excerpt?: string | null;
  status: "supported" | "unsupported" | "uncertain";
  requiredQualifier?: string | null;
  visualImplication?: string | null;
  uncertainty?: string | null;
}

/** Thrown by a stage to park the run in a blocked state instead of failing it. */
export class BlockedError extends Error {
  constructor(
    readonly code:
      | "BLOCKED_CREDENTIAL"
      | "BLOCKED_BUDGET"
      | "BLOCKED_LICENSE"
      | "BLOCKED_CAPTIONS_AUTH",
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "BlockedError";
  }
}
