import { describe, it, expect, afterEach, vi } from "vitest";
import { ElevenLabsVoice, MockVoice } from "../src/voice.js";
import { CaptionsAiPostProcessor, MockPostProcessor } from "../src/postprocess.js";
import type { CaptionLine } from "../src/types.js";

afterEach(() => vi.unstubAllGlobals());

const CAPTIONS: CaptionLine[] = [
  { startHint: 0, endHint: 1.8, text: "Your brain remembers pain", emphasis: "pain", position: "lower_center", style: "curio_premium" },
  { startHint: 1.8, endHint: 3.4, text: "better than praise.", emphasis: "praise", position: "lower_center", style: "curio_premium" },
];

describe("ElevenLabsVoice", () => {
  it("sends the script with the voice id and returns audio bytes", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });
    const v = new ElevenLabsVoice("el-key", { voiceId: "zack_style_voice" });
    const out = await v.synthesize("Short. Punchy. Zero filler.");

    expect(out.audio.byteLength).toBe(4);
    expect(out.mimeType).toBe("audio/mpeg");
    expect(out.voiceId).toBe("zack_style_voice");
    expect(calls[0].url).toContain("/v1/text-to-speech/zack_style_voice");
    expect(calls[0].init.headers["xi-api-key"]).toBe("el-key");
    const body = JSON.parse(calls[0].init.body);
    expect(body.text).toBe("Short. Punchy. Zero filler.");
    expect(body.model_id).toBe("eleven_multilingual_v2");
    expect(body.voice_settings.use_speaker_boost).toBe(true);
  });

  it("retries transient 5xx then succeeds", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      if (n === 1) return new Response("boom", { status: 502 });
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    const v = new ElevenLabsVoice("k", { voiceId: "vid" });
    const out = await v.synthesize("x");
    expect(out.audio.byteLength).toBe(1);
    expect(n).toBe(2);
  });

  it("fails fast without a voice id", async () => {
    const v = new ElevenLabsVoice("k", { voiceId: "" });
    await expect(v.synthesize("x")).rejects.toThrow("ELEVENLABS_VOICE_ID");
  });

  it("mock voice returns deterministic bytes", async () => {
    const out = await new MockVoice().synthesize("hello");
    expect(new TextDecoder().decode(out.audio)).toContain("MOCK_AUDIO");
  });
});

describe("CaptionsAiPostProcessor", () => {
  it("submits captions+cleanup ops and polls to completion", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    let polls = 0;
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      expect(init.headers["x-api-key"]).toBe("cap-key");
      if (url.endsWith("/edit/submit")) {
        return new Response(JSON.stringify({ operationId: "op_1" }), { status: 200 });
      }
      polls++;
      return new Response(
        JSON.stringify(polls < 2 ? { state: "PROCESSING" } : { state: "COMPLETE", url: "https://cdn.captions.ai/final.mp4" }),
        { status: 200 },
      );
    });

    const p = new CaptionsAiPostProcessor("cap-key");
    // Speed up the poll loop for the test
    const origSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void, _ms?: number) => origSetTimeout(fn, 1)) as any);

    const out = await p.process({ videoUrl: "https://cdn.heygen.com/raw.mp4", captionLines: CAPTIONS, language: "en" });

    expect(out.status).toBe("completed");
    expect(out.videoUrl).toBe("https://cdn.captions.ai/final.mp4");
    expect(out.operations).toEqual({ captions: true, cutFillers: true, cutSilences: true });
    const submit = calls[0].body;
    expect(submit.videoUrl).toBe("https://cdn.heygen.com/raw.mp4");
    expect(submit.removeFillerWords).toBe(true);
    expect(submit.removeSilences).toBe(true);
    expect(submit.srt).toContain("Your brain remembers pain");
    expect(submit.captionStyle.animation).toBe("none");
    expect(submit.captionStyle.textColor).toBe("#F5EFE2");
  });

  it("returns failed (never throws) when the provider errors", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/edit/submit")) {
        return new Response(JSON.stringify({ operationId: "op_2" }), { status: 200 });
      }
      return new Response(JSON.stringify({ state: "FAILED", error: "unsupported codec" }), { status: 200 });
    });
    const p = new CaptionsAiPostProcessor("k");
    const out = await p.process({ videoUrl: "https://x/raw.mp4", captionLines: CAPTIONS, language: "en" });
    expect(out.status).toBe("failed");
    expect(out.error).toContain("unsupported codec");
  });

  it("mock passes the render through flagged as captioned", async () => {
    const out = await new MockPostProcessor().process({
      videoUrl: "https://mock.heygen.local/videos/x.mp4", captionLines: CAPTIONS, language: "en",
    });
    expect(out.status).toBe("completed");
    expect(out.videoUrl).toBe("https://mock.heygen.local/videos/x.captioned.mp4");
  });
});
