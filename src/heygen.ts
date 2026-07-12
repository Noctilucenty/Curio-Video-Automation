// HeyGen client wrapper. HeyGen ONLY renders — script/tone/captions come from
// the OpenAI package and the NARRATION AUDIO comes from ElevenLabs (HeyGen
// lip-syncs to the uploaded asset; its own TTS is only the no-audio fallback).
// Missing key => MockRenderer so the pipeline completes offline. Provider
// responses are sanitized before storage (ids/urls/status only).

import type { VideoPackage } from "./types.js";

export interface RenderRequest {
  pkg: VideoPackage;
  avatarId: string;
  voiceId: string;
  /** HeyGen asset id of the ElevenLabs narration; when set, the avatar speaks this audio. */
  audioAssetId?: string;
  /** "card" = 4-6s static read-a-card short (no narration); default "narrated". */
  format?: "narrated" | "card";
}

export interface RenderStatus {
  providerVideoId: string;
  status: "rendering" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

export interface Renderer {
  readonly provider: "heygen" | "mock" | "local";
  /** True when the renderer burns curio_premium captions itself — the external
   * post-process step is skipped entirely for such renders. */
  readonly burnsCaptions: boolean;
  /** Upload narration audio; returns the provider asset id to render with. */
  uploadAudio(audio: Uint8Array, mimeType: string): Promise<{ assetId: string }>;
  createVideo(req: RenderRequest): Promise<{ providerVideoId: string }>;
  pollUntilDone(providerVideoId: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<RenderStatus>;
}

const CREATE_URL = "https://api.heygen.com/v2/video/generate";
const STATUS_URL = "https://api.heygen.com/v1/video_status.get";
const UPLOAD_URL = "https://upload.heygen.com/v1/asset";
const MAX_ATTEMPTS = 3;

export class HeyGenRenderer implements Renderer {
  readonly provider = "heygen" as const;
  readonly burnsCaptions = false;
  constructor(private apiKey: string) {}

  async uploadAudio(audio: Uint8Array, mimeType: string): Promise<{ assetId: string }> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(UPLOAD_URL, {
          method: "POST",
          headers: { "content-type": mimeType, "x-api-key": this.apiKey },
          body: audio as unknown as BodyInit,
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`heygen upload ${res.status}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`heygen upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data = (await res.json()) as { data?: { id?: string; asset_id?: string } };
        const assetId = data.data?.id ?? data.data?.asset_id;
        if (!assetId) throw new Error("heygen upload: no asset id in response");
        return { assetId };
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(500 * attempt * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async createVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    // ElevenLabs narration drives the avatar when present; HeyGen TTS is only
    // the fallback so the pipeline still renders if voice synthesis is skipped.
    const voice = req.audioAssetId
      ? { type: "audio", audio_asset_id: req.audioAssetId }
      : { type: "text", input_text: req.pkg.script, voice_id: req.voiceId };
    const body = {
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: req.avatarId, avatar_style: "normal" },
          voice,
          background: { type: "color", value: "#0B0B0F" },
        },
      ],
      dimension: { width: 1080, height: 1920 },
      // Captions are burned downstream by Captions.ai in our style, never HeyGen's.
      caption: false,
      title: req.pkg.title,
    };
    const data = await this.request<{ data?: { video_id?: string } }>(CREATE_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const id = data.data?.video_id;
    if (!id) throw new Error("heygen: no video_id in create response");
    return { providerVideoId: id };
  }

  async pollUntilDone(
    providerVideoId: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<RenderStatus> {
    const timeoutMs = opts.timeoutMs ?? 15 * 60_000;
    const intervalMs = opts.intervalMs ?? 10_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const data = await this.request<{
        data?: { status?: string; video_url?: string; error?: { message?: string } | null };
      }>(`${STATUS_URL}?video_id=${encodeURIComponent(providerVideoId)}`, { method: "GET" });
      const s = data.data?.status;
      if (s === "completed") {
        return { providerVideoId, status: "completed", videoUrl: data.data?.video_url };
      }
      if (s === "failed") {
        return { providerVideoId, status: "failed", error: data.data?.error?.message ?? "render failed" };
      }
      await sleep(intervalMs);
    }
    return { providerVideoId, status: "failed", error: `timed out after ${timeoutMs}ms` };
  }

  /** fetch with retry/backoff on 429/5xx/network; API key only lives here. */
  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: { "content-type": "application/json", "x-api-key": this.apiKey },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`heygen ${res.status}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`heygen ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

/** Instant fake renders for dev/tests; URL is deterministic per id. */
export class MockRenderer implements Renderer {
  readonly provider = "mock" as const;
  readonly burnsCaptions = false;
  private seq = 0;
  private assetSeq = 0;
  /** Remembers the last request so tests can assert the audio was wired in. */
  lastRequest: RenderRequest | null = null;
  async uploadAudio(_audio: Uint8Array, _mimeType: string): Promise<{ assetId: string }> {
    return { assetId: `mock_audio_${++this.assetSeq}` };
  }
  async createVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    this.lastRequest = req;
    return { providerVideoId: `mock_render_${++this.seq}` };
  }
  async pollUntilDone(providerVideoId: string): Promise<RenderStatus> {
    return {
      providerVideoId,
      status: "completed",
      videoUrl: `https://mock.heygen.local/videos/${providerVideoId}.mp4`,
    };
  }
}

export function makeRenderer(apiKey: string | null): Renderer {
  return apiKey ? new HeyGenRenderer(apiKey) : new MockRenderer();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
