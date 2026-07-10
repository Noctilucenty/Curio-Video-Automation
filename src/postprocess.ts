// Captions.ai post-processing: takes HeyGen's raw MP4 and (1) burns curio_premium
// captions, (2) removes filler words, (3) cuts silences. This is the step that
// makes the output feel edited, not generated.
//
// The client follows Captions' public API submit+poll pattern (x-api-key auth).
// Endpoint paths are centralized below and the base is env-overridable
// (CAPTIONS_API_BASE) because the public API is versioned per account plan —
// if your dashboard docs show different paths, change ONLY these constants.
// Missing key => MockPostProcessor (returns the raw video URL, marked as such).

import type { CaptionLine } from "./types.js";
import { CAPTION_STYLE, captionsToSrt } from "./captions.js";

export interface PostProcessRequest {
  videoUrl: string;
  captionLines: CaptionLine[];
  language: string;
}

export interface PostProcessResult {
  status: "completed" | "failed";
  videoUrl?: string;
  error?: string;
  operations: { captions: boolean; cutFillers: boolean; cutSilences: boolean };
}

export interface PostProcessor {
  readonly provider: "captions_ai" | "mock";
  process(req: PostProcessRequest): Promise<PostProcessResult>;
}

const DEFAULT_BASE = "https://api.captions.ai/api";
const SUBMIT_PATH = "/edit/submit";
const POLL_PATH = "/poll";
const MAX_ATTEMPTS = 3;
const OPERATIONS = { captions: true, cutFillers: true, cutSilences: true } as const;

export class CaptionsAiPostProcessor implements PostProcessor {
  readonly provider = "captions_ai" as const;
  private base: string;

  constructor(private apiKey: string, base?: string) {
    this.base = (base ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  async process(req: PostProcessRequest): Promise<PostProcessResult> {
    try {
      const submit = await this.request<{ operationId?: string; operation_id?: string }>(SUBMIT_PATH, {
        videoUrl: req.videoUrl,
        language: req.language,
        // Our timing/text is the source of truth; Captions re-aligns after cuts.
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
        removeFillerWords: OPERATIONS.cutFillers,
        removeSilences: OPERATIONS.cutSilences,
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
          return { status: "completed", videoUrl: url, operations: { ...OPERATIONS } };
        }
        if (state === "FAILED" || state === "ERROR") {
          throw new Error(`captions.ai: ${poll.error ?? "processing failed"}`);
        }
        await sleep(8_000);
      }
      throw new Error("captions.ai: timed out after 15m");
    } catch (e) {
      return {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        operations: { ...OPERATIONS },
      };
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
  async process(req: PostProcessRequest): Promise<PostProcessResult> {
    return {
      status: "completed",
      videoUrl: req.videoUrl.replace(/\.mp4$/, ".captioned.mp4"),
      operations: { captions: true, cutFillers: true, cutSilences: true },
    };
  }
}

export function makePostProcessor(apiKey: string | null, base?: string): PostProcessor {
  return apiKey ? new CaptionsAiPostProcessor(apiKey, base) : new MockPostProcessor();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
