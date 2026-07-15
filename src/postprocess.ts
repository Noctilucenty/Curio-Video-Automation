// Captions post-processing — captions ONLY by default, timeline never touched.
//
// TIMELINE POLICY (the core safety contract):
//   locked_master : captions only. Silence + filler removal are FORCED false;
//                   a request that asks to cut either is REJECTED, not silently
//                   coerced. A finished master's silences and pacing are
//                   intentional (e.g. REP-3's engineered 0.65s pre-crack
//                   collapse and its 15.45s fracture sync) and trimming would
//                   destroy them.
//   raw_spoken    : trimming is allowed, but ONLY through explicit opt-in;
//                   default is still captions-only.
// The resolved operations are persisted with every result so a reviewer can
// see after the fact that a locked master was never trimmed.
//
// REVEAL PROTECTION: a locked master carries a curated caption track with
// designed reveal timing (a caption must not appear before its payoff). If a
// provider can only AUTO-TRANSCRIBE (styles captions generated from the audio,
// with no custom timing), running it would discard our wording and spoil the
// reveal. For a locked master with a curated track, such a provider is REFUSED
// with a capability blocker — we never silently fall back to auto captions.
//
// PROVIDERS:
//   MiragePostProcessor      — the CURRENT live contract (api.mirage.app):
//                              multipart upload + caption_template_id + poll +
//                              content download. Auto-transcription only in the
//                              public contract → supportsCustomCaptionTiming
//                              defaults false (override per account if a custom
//                              caption field is provisioned). It has no trim
//                              flags at all, so it cannot violate "no cutting".
//   CaptionsAiPostProcessor  — the LEGACY submit+poll contract (api.captions.ai
//                              /edit/submit). Accepts a custom SRT + trim flags,
//                              so it CAN honor a locked master — but the host
//                              was returning 502 as of 2026-07-14 (degraded /
//                              likely deprecated). Kept for back-compat + tests.
//   MockPostProcessor        — passthrough for offline runs.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { CaptionLine } from "./types.js";
import { CAPTION_STYLE, captionsToSrt } from "./captions.js";

export type TimelinePolicy = "locked_master" | "raw_spoken";

/** The operations that ACTUALLY ran, persisted with the result. */
export interface ResolvedOperations {
  captions: boolean;
  cutFillers: boolean;
  cutSilences: boolean;
  policy: TimelinePolicy;
}

export interface PostProcessRequest {
  /** Existing source URL (legacy submit path) — an http(s) URL Captions fetches. */
  videoUrl: string;
  captionLines: CaptionLine[];
  language: string;
  /** Timeline contract. Defaults to the safe policy: locked_master. */
  policy?: TimelinePolicy;
  /** raw_spoken only: opt into trimming. Ignored (and rejected if true) under
   * locked_master. */
  requestedTrim?: { cutFillers?: boolean; cutSilences?: boolean };
  /** Local MP4 to multipart-upload (Mirage contract, <=50MB, 9:16). */
  localFilePath?: string;
  /** Mirage caption style template id. */
  captionTemplateId?: string;
  /** Does this job carry a curated caption track whose reveal timing matters?
   * Defaults to (captionLines.length > 0). When true, an auto-transcription-only
   * provider is refused under locked_master. */
  hasCuratedCaptionTrack?: boolean;
}

export interface PostProcessResult {
  status: "completed" | "failed";
  videoUrl?: string;
  error?: string;
  operations: ResolvedOperations;
}

export interface PostProcessor {
  readonly provider: "captions_ai" | "mirage" | "mock";
  /** True if the provider honors a user-supplied caption track with exact
   * timing. False = auto-transcription only (reveal timing cannot be trusted). */
  readonly supportsCustomCaptionTiming: boolean;
  process(req: PostProcessRequest): Promise<PostProcessResult>;
}

/**
 * Resolve the operations for a job under its timeline policy. This is the one
 * place trimming can be turned on, and it is the guard the whole module leans
 * on. Pure + synchronous so it is trivially unit-testable.
 *
 * @throws if a locked_master job requests any cut — never silently coerced.
 */
export function resolveOperations(
  policy: TimelinePolicy = "locked_master",
  requested?: { cutFillers?: boolean; cutSilences?: boolean },
): ResolvedOperations {
  if (policy === "locked_master") {
    if (requested?.cutFillers === true || requested?.cutSilences === true) {
      throw new Error(
        "locked_master forbids timeline edits: cutFillers/cutSilences must be " +
          "false. A finished master's silences and pacing are intentional. Use " +
          "policy 'raw_spoken' to opt into trimming a raw take.",
      );
    }
    return { captions: true, cutFillers: false, cutSilences: false, policy };
  }
  // raw_spoken: trimming allowed ONLY via explicit opt-in; default off.
  return {
    captions: true,
    cutFillers: requested?.cutFillers === true,
    cutSilences: requested?.cutSilences === true,
    policy,
  };
}

/** Refuse an auto-transcription-only provider on a locked master that carries a
 * curated caption track — running it would discard our wording + reveal timing.
 * Returns an error string to fail with, or null if the job may proceed. */
export function revealProtectionBlocker(
  req: PostProcessRequest,
  ops: ResolvedOperations,
  supportsCustomCaptionTiming: boolean,
): string | null {
  const curated = req.hasCuratedCaptionTrack ?? (req.captionLines?.length ?? 0) > 0;
  if (ops.policy === "locked_master" && curated && !supportsCustomCaptionTiming) {
    return (
      "CAPABILITY_BLOCKER: this provider is auto-transcription only and cannot " +
      "honor the curated caption track or reveal timing of a locked master. " +
      "Auto-captioning would spoil the designed reveal and dump the transcript. " +
      "Refusing rather than silently falling back to auto captions. Supply a " +
      "provider/account that accepts a custom caption track, or run this master " +
      "through the manual captioning path."
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mirage — the current live contract (api.mirage.app)
// ---------------------------------------------------------------------------

const MIRAGE_BASE = "https://api.mirage.app";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

export interface MirageOptions {
  captionTemplateId?: string;
  /** Set true only if the account is provisioned for custom caption timing
   * (not in the public contract). Governs reveal protection. */
  supportsCustomCaptionTiming?: boolean;
}

export class MiragePostProcessor implements PostProcessor {
  readonly provider = "mirage" as const;
  readonly supportsCustomCaptionTiming: boolean;
  private base: string;
  private templateId?: string;

  constructor(private apiKey: string, base?: string, opts?: MirageOptions) {
    this.base = (base ?? MIRAGE_BASE).replace(/\/$/, "");
    this.templateId = opts?.captionTemplateId;
    this.supportsCustomCaptionTiming = opts?.supportsCustomCaptionTiming ?? false;
  }

  async process(req: PostProcessRequest): Promise<PostProcessResult> {
    let ops: ResolvedOperations;
    try {
      ops = resolveOperations(req.policy ?? "locked_master", req.requestedTrim);
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e),
        operations: fallbackOps(req) };
    }

    const blocker = revealProtectionBlocker(req, ops, this.supportsCustomCaptionTiming);
    if (blocker) return { status: "failed", error: blocker, operations: ops };

    const templateId = req.captionTemplateId ?? this.templateId;
    if (!templateId) {
      return { status: "failed", operations: ops,
        error: "mirage: caption_template_id is required (set MIRAGE_CAPTION_TEMPLATE_ID)" };
    }
    const src = req.localFilePath ?? req.videoUrl;
    if (!src || /^https?:/i.test(src)) {
      return { status: "failed", operations: ops,
        error: "mirage: a LOCAL mp4 file is required (localFilePath); the contract is multipart upload, not a URL" };
    }

    try {
      const bytes = await readFile(src);
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        return { status: "failed", operations: ops,
          error: `mirage: file ${bytes.byteLength} bytes exceeds the 50MB upload limit` };
      }
      const form = new FormData();
      form.set("caption_template_id", templateId);
      form.set("video", new Blob([bytes], { type: "video/mp4" }), basename(src));

      const submit = await this.request<{ id?: string; video_id?: string }>(
        "POST", "/v1/videos/captions", form,
      );
      const id = submit.id ?? submit.video_id;
      if (!id) throw new Error("mirage: no video id in captions response");

      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        const poll = await this.request<{ status?: string; error?: { message?: string } }>(
          "GET", `/v1/videos/${id}`,
        );
        const state = (poll.status ?? "").toUpperCase();
        if (state === "COMPLETE" || state === "COMPLETED") {
          // The content endpoint 302-redirects to the finished file.
          return { status: "completed", operations: ops,
            videoUrl: `${this.base}/v1/videos/${id}/content` };
        }
        if (state === "FAILED" || state === "CANCELLED" || state === "ERROR") {
          throw new Error(`mirage: ${poll.error?.message ?? state}`);
        }
        await sleep(8_000);
      }
      throw new Error("mirage: timed out after 15m");
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e), operations: ops };
    }
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: FormData): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${this.base}${path}`, {
          method,
          headers: { "x-api-key": this.apiKey }, // FormData sets its own content-type
          body,
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`mirage ${res.status}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`mirage ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(500 * attempt * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

// ---------------------------------------------------------------------------
// Legacy Captions.ai submit+poll (degraded 502 as of 2026-07-14, kept for tests)
// ---------------------------------------------------------------------------

const DEFAULT_BASE = "https://api.captions.ai/api";
const SUBMIT_PATH = "/edit/submit";
const POLL_PATH = "/poll";

export class CaptionsAiPostProcessor implements PostProcessor {
  readonly provider = "captions_ai" as const;
  // The legacy contract sends our SRT verbatim, so it honors custom timing.
  readonly supportsCustomCaptionTiming = true;
  private base: string;

  constructor(private apiKey: string, base?: string) {
    this.base = (base ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  async process(req: PostProcessRequest): Promise<PostProcessResult> {
    let ops: ResolvedOperations;
    try {
      ops = resolveOperations(req.policy ?? "locked_master", req.requestedTrim);
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e),
        operations: fallbackOps(req) };
    }
    try {
      const submit = await this.request<{ operationId?: string; operation_id?: string }>(SUBMIT_PATH, {
        videoUrl: req.videoUrl,
        language: req.language,
        srt: captionsToSrt(req.captionLines),
        captionStyle: {
          template: "custom",
          fontFamily: CAPTION_STYLE.fontFamily,
          textColor: CAPTION_STYLE.textColor,
          emphasisColor: CAPTION_STYLE.emphasisColor,
          fontWeight: CAPTION_STYLE.fontWeightBase,
          emphasisFontWeight: CAPTION_STYLE.fontWeightEmphasis,
          emphasisScale: CAPTION_STYLE.emphasisScale,
          position: CAPTION_STYLE.defaultPosition,
          maxWordsPerLine: CAPTION_STYLE.maxWordsPerLine,
          animation: "none", // no bounce/karaoke — brand rule
        },
        // Resolved under the timeline policy — captions-only for a locked master.
        removeFillerWords: ops.cutFillers,
        removeSilences: ops.cutSilences,
      });
      const opId = submit.operationId ?? submit.operation_id;
      if (!opId) throw new Error("captions.ai: no operationId in submit response");

      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        const poll = await this.request<{ state?: string; status?: string; url?: string; videoUrl?: string; error?: string }>(
          POLL_PATH,
          { operationId: opId },
        );
        const state = (poll.state ?? poll.status ?? "").toUpperCase();
        if (state === "COMPLETE" || state === "COMPLETED" || state === "SUCCESS") {
          const url = poll.url ?? poll.videoUrl;
          if (!url) throw new Error("captions.ai: completed without a video url");
          return { status: "completed", videoUrl: url, operations: ops };
        }
        if (state === "FAILED" || state === "ERROR") {
          throw new Error(`captions.ai: ${poll.error ?? "processing failed"}`);
        }
        await sleep(8_000);
      }
      throw new Error("captions.ai: timed out after 15m");
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e), operations: ops };
    }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${this.base}${path}`, {
          method: "POST",
          headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`captions.ai ${res.status}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`captions.ai ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(500 * attempt * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

/** Passes the raw video through, flagged so the dashboard shows it's unedited. */
export class MockPostProcessor implements PostProcessor {
  readonly provider = "mock" as const;
  readonly supportsCustomCaptionTiming = true;
  async process(req: PostProcessRequest): Promise<PostProcessResult> {
    const ops = resolveOperations(req.policy ?? "locked_master", req.requestedTrim);
    return {
      status: "completed",
      videoUrl: req.videoUrl.replace(/\.mp4$/, ".captioned.mp4"),
      operations: ops,
    };
  }
}

/** When policy resolution itself throws, we still need an operations record for
 * the failed result — report captions-only under the requested policy. */
function fallbackOps(req: PostProcessRequest): ResolvedOperations {
  return { captions: true, cutFillers: false, cutSilences: false, policy: req.policy ?? "locked_master" };
}

export type MakePostProcessorOptions = MirageOptions;

/**
 * Pick the provider. The current live contract is Mirage; the legacy
 * captions.ai host is degraded, so it is only selected when a base explicitly
 * points at it. No key => offline mock.
 */
export function makePostProcessor(
  apiKey: string | null,
  base?: string,
  opts?: MakePostProcessorOptions,
): PostProcessor {
  if (!apiKey) return new MockPostProcessor();
  if (base && /captions\.ai/i.test(base)) return new CaptionsAiPostProcessor(apiKey, base);
  return new MiragePostProcessor(apiKey, base, opts);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
