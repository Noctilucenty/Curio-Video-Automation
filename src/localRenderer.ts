// Local no-avatar renderer: the Curio dark-editorial format rendered entirely
// on this machine. Slow-drifting obsidian gradient + film grain, caption beats
// rasterized to PNG by native macOS typography (tools/caption_render.swift),
// composited over the ElevenLabs narration with per-beat alpha fades.
// Captions are burned HERE, so the external post-process step is unnecessary
// (a verbatim TTS read has no filler words or dead silences to cut).
//
// Optional audio bed: drop a licensed drone track at assets/drone.mp3 (or
// .m4a/.wav) and it gets mixed under the narration at low level automatically.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RenderRequest, RenderStatus, Renderer } from "./heygen.js";
import { CAPTION_STYLE } from "./captions.js";
import { makeId } from "./config.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FONT_SIZE = 58;
const DRONE_CANDIDATES = ["assets/drone.mp3", "assets/drone.m4a", "assets/drone.wav"];

export class LocalRenderer implements Renderer {
  readonly provider = "local" as const;
  readonly burnsCaptions = true;
  private audio = new Map<string, string>();
  private results = new Map<string, RenderStatus>();
  private toolPath: string;
  private dirs: { tmp: string; videos: string; bin: string };

  constructor(private dataDir: string) {
    this.dirs = {
      tmp: join(dataDir, "tmp"),
      videos: join(dataDir, "videos"),
      bin: join(dataDir, "bin"),
    };
    for (const d of Object.values(this.dirs)) mkdirSync(d, { recursive: true });
    this.toolPath = join(this.dirs.bin, "caption_render");
  }

  async uploadAudio(audio: Uint8Array, mimeType: string): Promise<{ assetId: string }> {
    const assetId = makeId("laud");
    const ext = mimeType.includes("wav") ? "wav" : "mp3";
    const path = join(this.dirs.tmp, `${assetId}.${ext}`);
    writeFileSync(path, audio);
    this.audio.set(assetId, path);
    return { assetId };
  }

  async createVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    if (req.format === "card") return this.createCardVideo(req);
    if (!req.audioAssetId || !this.audio.has(req.audioAssetId)) {
      throw new Error("local renderer needs the ElevenLabs narration (no TTS fallback exists locally)");
    }
    const audioPath = this.audio.get(req.audioAssetId)!;
    const providerVideoId = makeId("localvid");
    const outPath = join(this.dirs.videos, `${providerVideoId}.mp4`);

    const duration = probeDuration(audioPath);
    if (!(duration > 0)) throw new Error("narration audio has no readable duration");

    // Scale caption hints to the real narration length: beats were written for
    // the script, the narrator (at 1.08x) decides the actual clock.
    const lines = req.pkg.captionLines;
    const lastEnd = Math.max(...lines.map((l) => l.endHint), 0.1);
    const scale = duration / lastEnd;

    const pngDir = join(this.dirs.tmp, providerVideoId);
    this.renderCaptionPngs(pngDir, lines.map((l, i) => ({ id: `c${i}`, text: l.text, emphasis: l.emphasis })));

    // ---- ffmpeg composition -------------------------------------------------
    const droneFile = DRONE_CANDIDATES.map((p) => resolve(p)).find((p) => existsSync(p));
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    const total = duration + 0.4;

    // [0] background: near-black drifting gradient
    args.push(
      "-f", "lavfi",
      "-i", `gradients=s=${WIDTH}x${HEIGHT}:c0=0x17131C:c1=0x07070C:x0=540:y0=520:x1=540:y1=1980:speed=0.006:rate=${FPS}:duration=${total.toFixed(2)}`,
    );
    // [1] narration
    args.push("-i", audioPath);
    // [2] optional drone bed
    if (droneFile) args.push("-i", droneFile);
    // [3..] caption stills (looped so fades have a timeline)
    const pngBase = 2 + (droneFile ? 1 : 0);
    for (let i = 0; i < lines.length; i++) {
      args.push("-loop", "1", "-t", total.toFixed(2), "-i", join(pngDir, `c${i}.png`));
    }

    const fc: string[] = [];
    fc.push(`[0:v]noise=alls=4:allf=t[bg]`);
    let prev = "bg";
    lines.forEach((l, i) => {
      const s = Math.max(0, l.startHint * scale);
      const e = Math.min(total, l.endHint * scale);
      const fadeOutStart = Math.max(s, e - 0.12);
      fc.push(
        `[${pngBase + i}:v]format=rgba,fade=t=in:st=${s.toFixed(2)}:d=0.1:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.12:alpha=1[c${i}]`,
      );
      const next = i === lines.length - 1 ? "vout" : `v${i}`;
      // Bottom-anchored inside the safe area (platform UI stays clear).
      const y = `H*${(1 - CAPTION_STYLE.safeAreaBottomPct / 100).toFixed(2)}-h`;
      fc.push(`[${prev}][c${i}]overlay=x=(W-w)/2:y=${y}:enable='between(t,${s.toFixed(2)},${e.toFixed(2)})'[${next}]`);
      prev = next;
    });
    fc.push(`[${prev}]format=yuv420p[v]`);
    if (droneFile) {
      fc.push(`[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0:weights=1 0.12,afade=t=out:st=${Math.max(0, duration - 1.2).toFixed(2)}:d=1.2[a]`);
    }

    args.push(
      "-filter_complex", fc.join(";"),
      "-map", "[v]",
      "-map", droneFile ? "[a]" : "1:a",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-r", String(FPS),
      "-t", total.toFixed(2),
      "-movflags", "+faststart",
      outPath,
    );

    const res = spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 5 * 60_000 });
    if (res.status !== 0) {
      throw new Error(`ffmpeg failed: ${(res.stderr || res.stdout || "unknown").slice(-500)}`);
    }
    this.results.set(providerVideoId, {
      providerVideoId,
      status: "completed",
      videoUrl: `/videos/${providerVideoId}.mp4`,
    });
    return { providerVideoId };
  }

  /**
   * Static read-a-card short (4-6s): one full-frame typographic card, film
   * grain for life, optional low bed audio (assets/bed.* or the drone file).
   * The video is deliberately SHORTER than its read time — pause/screenshot/
   * rewatch behavior is the retention mechanic (see WINNING_REFERENCES.md).
   */
  private async createCardVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    const providerVideoId = makeId("localcard");
    const outPath = join(this.dirs.videos, `${providerVideoId}.mp4`);
    const pngDir = join(this.dirs.tmp, providerVideoId);

    this.ensureCaptionTool();
    mkdirSync(pngDir, { recursive: true });
    const specPath = join(pngDir, "spec.json");
    writeFileSync(specPath, JSON.stringify({
      mode: "card",
      width: WIDTH,
      height: HEIGHT,
      outDir: pngDir,
      fontSize: 40,
      title: req.pkg.title,
      footer: req.pkg.cta,
      // Card list items: the caption beats, minus any final line that just
      // repeats the CTA (the footer already carries the signature).
      lines: req.pkg.captionLines
        .filter((l) => !l.text.toLowerCase().includes("curio"))
        .slice(0, 8)
        .map((l, i) => ({ id: `i${i}`, text: l.text.replace(/\s+/g, " ").trim(), emphasis: l.emphasis })),
    }));
    execFileSync(this.toolPath, [specPath], { timeout: 60_000 });
    const cardPng = join(pngDir, "card.png");
    if (!existsSync(cardPng)) throw new Error("card png was not produced");

    const DURATION = 5.2;
    const bedFile = ["assets/bed.mp3", "assets/bed.m4a", "assets/bed.wav", ...DRONE_CANDIDATES]
      .map((p) => resolve(p))
      .find((p) => existsSync(p));

    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    args.push("-loop", "1", "-t", String(DURATION), "-i", cardPng);
    if (bedFile) args.push("-i", bedFile);
    else args.push("-f", "lavfi", "-t", String(DURATION), "-i", "anullsrc=r=44100:cl=stereo");

    const audioChain = bedFile
      ? `[1:a]atrim=0:${DURATION},volume=0.35,afade=t=in:st=0:d=0.4,afade=t=out:st=${(DURATION - 0.8).toFixed(2)}:d=0.8[a]`
      : `[1:a]anull[a]`;
    args.push(
      "-filter_complex",
      `[0:v]noise=alls=3:allf=t,format=yuv420p[v];${audioChain}`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-c:a", "aac", "-b:a", "160k",
      "-r", String(FPS),
      "-t", String(DURATION),
      "-movflags", "+faststart",
      outPath,
    );
    const res = spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 3 * 60_000 });
    if (res.status !== 0) {
      throw new Error(`ffmpeg card failed: ${(res.stderr || res.stdout || "unknown").slice(-500)}`);
    }
    this.results.set(providerVideoId, {
      providerVideoId,
      status: "completed",
      videoUrl: `/videos/${providerVideoId}.mp4`,
    });
    return { providerVideoId };
  }

  async pollUntilDone(providerVideoId: string): Promise<RenderStatus> {
    return (
      this.results.get(providerVideoId) ?? {
        providerVideoId,
        status: "failed",
        error: "unknown local render id",
      }
    );
  }

  /** Compile the Swift caption tool once (recompiles when the source is newer). */
  private ensureCaptionTool(): void {
    const src = resolve("tools/caption_render.swift");
    if (!existsSync(src)) throw new Error("tools/caption_render.swift missing");
    const stale = !existsSync(this.toolPath) || statSync(this.toolPath).mtimeMs < statSync(src).mtimeMs;
    if (stale) {
      execFileSync("xcrun", ["swiftc", "-O", src, "-o", this.toolPath], { timeout: 120_000 });
    }
  }

  private renderCaptionPngs(outDir: string, lines: Array<{ id: string; text: string; emphasis: string }>): void {
    this.ensureCaptionTool();
    mkdirSync(outDir, { recursive: true });
    const specPath = join(outDir, "spec.json");
    writeFileSync(specPath, JSON.stringify({ width: WIDTH, outDir, fontSize: FONT_SIZE, lines }));
    execFileSync(this.toolPath, [specPath], { timeout: 60_000 });
    for (const l of lines) {
      if (!existsSync(join(outDir, `${l.id}.png`))) throw new Error(`caption png missing: ${l.id}`);
    }
  }
}

function probeDuration(path: string): number {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8", timeout: 30_000 },
  );
  return Number(String(res.stdout).trim());
}
