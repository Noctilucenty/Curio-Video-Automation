import { describe, it, expect, afterEach, vi } from "vitest";
import { HeyGenRenderer, MockRenderer } from "../src/heygen.js";
import type { VideoPackage } from "../src/types.js";

const pkg: VideoPackage = {
  topic: "t", category: "c", targetPlatform: "tiktok", hookOptions: ["a", "b", "c"],
  selectedHook: "hook", script: "the spoken script", sceneDirection: "dark", avatarTone: "calm",
  captionLines: [], title: "title", thumbnailText: "thumb", postCaption: "post",
  hashtags: ["#a"], cta: "cta", estimatedLengthSeconds: 28,
};

afterEach(() => vi.unstubAllGlobals());

describe("MockRenderer", () => {
  it("completes instantly with a deterministic url", async () => {
    const r = new MockRenderer();
    const { providerVideoId } = await r.createVideo({ pkg, avatarId: "a", voiceId: "v" });
    const status = await r.pollUntilDone(providerVideoId);
    expect(status.status).toBe("completed");
    expect(status.videoUrl).toContain(providerVideoId);
  });
});

describe("HeyGenRenderer", () => {
  it("sends the script + avatar/voice and returns the provider video id", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { video_id: "hg_123" } }), { status: 200 });
    });
    const r = new HeyGenRenderer("test-key");
    const { providerVideoId } = await r.createVideo({ pkg, avatarId: "av9", voiceId: "vo9" });

    expect(providerVideoId).toBe("hg_123");
    const body = JSON.parse(calls[0].init.body);
    expect(body.video_inputs[0].voice.input_text).toBe("the spoken script");
    expect(body.video_inputs[0].character.avatar_id).toBe("av9");
    expect(body.dimension).toEqual({ width: 1080, height: 1920 });
    // key travels in the header, never the body
    expect(calls[0].init.headers["x-api-key"]).toBe("test-key");
    expect(calls[0].init.body).not.toContain("test-key");
  });

  it("retries transient 5xx then succeeds", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      if (n === 1) return new Response("boom", { status: 503 });
      return new Response(JSON.stringify({ data: { video_id: "hg_after_retry" } }), { status: 200 });
    });
    const r = new HeyGenRenderer("k");
    const { providerVideoId } = await r.createVideo({ pkg, avatarId: "a", voiceId: "v" });
    expect(providerVideoId).toBe("hg_after_retry");
    expect(n).toBe(2);
  });

  it("polls until completed and returns the video url", async () => {
    let polls = 0;
    vi.stubGlobal("fetch", async () => {
      polls++;
      const status = polls < 3 ? "processing" : "completed";
      return new Response(
        JSON.stringify({ data: { status, video_url: status === "completed" ? "https://cdn/x.mp4" : undefined } }),
        { status: 200 },
      );
    });
    const r = new HeyGenRenderer("k");
    const done = await r.pollUntilDone("hg_1", { intervalMs: 1 });
    expect(done.status).toBe("completed");
    expect(done.videoUrl).toBe("https://cdn/x.mp4");
    expect(polls).toBe(3);
  });

  it("surfaces provider failure with its error message", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: { status: "failed", error: { message: "avatar not found" } } }), { status: 200 }),
    );
    const r = new HeyGenRenderer("k");
    const done = await r.pollUntilDone("hg_1", { intervalMs: 1 });
    expect(done.status).toBe("failed");
    expect(done.error).toBe("avatar not found");
  });
});
