import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalRenderer } from "../src/localRenderer.js";
import type { VideoPackage } from "../src/types.js";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const hasSwift = spawnSync("xcrun", ["swiftc", "--version"], { encoding: "utf8" }).status === 0;
const runnable = hasFfmpeg && hasSwift;

const pkg: VideoPackage = {
  topic: "t", category: "c", targetPlatform: "tiktok", hookOptions: ["a", "b", "c"],
  selectedHook: "hook", script: "s", sceneDirection: "dark", avatarTone: "calm",
  captionLines: [
    { startHint: 0, endHint: 1.0, text: "Your brain remembers pain", emphasis: "pain", position: "lower_center", style: "curio_premium" },
    { startHint: 1.0, endHint: 2.0, text: "better than praise.", emphasis: "praise", position: "lower_center", style: "curio_premium" },
  ],
  title: "title", thumbnailText: "thumb", postCaption: "post",
  hashtags: ["#a"], cta: "cta", estimatedLengthSeconds: 2,
};

describe.skipIf(!runnable)("LocalRenderer (real ffmpeg + swift typography)", () => {
  it("renders a finished mp4 with burned captions from narration audio", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "curio-local-render-"));
    // 2s sine tone as stand-in narration (MockVoice bytes aren't decodable audio)
    const tonePath = join(dataDir, "tone.mp3");
    const gen = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=2", "-b:a", "128k", tonePath],
      { encoding: "utf8", timeout: 60_000 });
    expect(gen.status).toBe(0);

    const r = new LocalRenderer(dataDir);
    expect(r.burnsCaptions).toBe(true);
    const { assetId } = await r.uploadAudio(readFileSync(tonePath), "audio/mpeg");
    const { providerVideoId } = await r.createVideo({ pkg, avatarId: "", voiceId: "", audioAssetId: assetId });
    const done = await r.pollUntilDone(providerVideoId);

    expect(done.status).toBe("completed");
    expect(done.videoUrl).toBe(`/videos/${providerVideoId}.mp4`);
    const outPath = join(dataDir, "videos", `${providerVideoId}.mp4`);
    expect(existsSync(outPath)).toBe(true);

    // container sanity: one video + one audio stream, ~2.4s, 1080x1920
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries",
      "stream=codec_type,width,height:format=duration", "-of", "json", outPath],
      { encoding: "utf8", timeout: 30_000 });
    const info = JSON.parse(probe.stdout);
    const types = info.streams.map((s: any) => s.codec_type).sort();
    expect(types).toEqual(["audio", "video"]);
    const v = info.streams.find((s: any) => s.codec_type === "video");
    expect(v.width).toBe(1080);
    expect(v.height).toBe(1920);
    expect(Number(info.format.duration)).toBeGreaterThan(2);
    expect(Number(info.format.duration)).toBeLessThan(3.5);
  }, 180_000);

  it("refuses to render without narration audio", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "curio-local-render-"));
    const r = new LocalRenderer(dataDir);
    await expect(r.createVideo({ pkg, avatarId: "", voiceId: "" })).rejects.toThrow(/narration/);
  });
});

describe.skipIf(!runnable)("LocalRenderer card mode (real ffmpeg + swift)", () => {
  it("renders an AUDIBLE ~6s card with synthesized bed — silence gate enforced", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "curio-card-render-"));
    const r = new LocalRenderer(dataDir);
    const { providerVideoId } = await r.createVideo({
      pkg: {
        ...pkg,
        title: "Your brain signs contracts you never see",
        cta: "Real rabbit holes live in Curio.",
        captionLines: [
          { startHint: 0, endHint: 2, text: "The Zeigarnik effect keeps unfinished tasks pinging you", emphasis: "Zeigarnik effect", position: "lower_center", style: "curio_premium" },
          { startHint: 2, endHint: 4, text: "Anchoring lets the first number drag your judgment", emphasis: "Anchoring", position: "lower_center", style: "curio_premium" },
          { startHint: 4, endHint: 6, text: "Emotional contagion syncs your mood to the room", emphasis: "Emotional contagion", position: "lower_center", style: "curio_premium" },
          { startHint: 6, endHint: 8, text: "Choice-supportive memory rewrites your past picks kindly", emphasis: "Choice-supportive memory", position: "lower_center", style: "curio_premium" },
        ],
      },
      avatarId: "", voiceId: "", format: "card",
    });
    const status = await r.pollUntilDone(providerVideoId);
    expect(status.status).toBe("completed");

    const outPath = join(dataDir, "videos", `${providerVideoId}.mp4`);
    expect(existsSync(outPath)).toBe(true);

    // duration ~6s and streams present
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "default=noprint_wrappers=1", outPath], { encoding: "utf8" });
    expect(probe.stdout).toContain("codec_type=video");
    expect(probe.stdout).toContain("codec_type=audio");
    const dur = Number(probe.stdout.match(/duration=([\d.]+)/)?.[1]);
    expect(dur).toBeGreaterThan(5.5);
    expect(dur).toBeLessThan(6.6);

    // THE regression that shipped in card v1: audio track existed but was
    // pure silence. The synthesized bed must be genuinely audible.
    const vol = spawnSync("ffmpeg", ["-hide_banner", "-i", outPath, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
    const mean = Number(`${vol.stderr}`.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1]);
    expect(mean).toBeGreaterThan(-55);
  }, 120_000);
});
