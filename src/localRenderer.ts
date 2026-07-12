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
    assertAudible(outPath); // narration must actually be audible in the mux
    this.results.set(providerVideoId, {
      providerVideoId,
      status: "completed",
      videoUrl: `/videos/${providerVideoId}.mp4`,
    });
    return { providerVideoId };
  }

  /**
   * Static read-a-card short (~6s): one full-frame typographic card with slow
   * push-in + grain, a continuous dark ambient bed (licensed file if present,
   * synthesized otherwise — silence is NEVER acceptable), and the signature
   * footer fading in for the final stretch only. The video is deliberately
   * SHORTER than its read time — pause/screenshot/rewatch is the retention
   * mechanic (see WINNING_REFERENCES.md).
   */
  private async createCardVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    const providerVideoId = makeId("localcard");
    const outPath = join(this.dirs.videos, `${providerVideoId}.mp4`);
    const pngDir = join(this.dirs.tmp, providerVideoId);

    this.ensureCaptionTool();
    mkdirSync(pngDir, { recursive: true });

    // Card face WITHOUT the footer — branding fades in late, not permanently.
    const specPath = join(pngDir, "spec.json");
    writeFileSync(specPath, JSON.stringify({
      mode: "card",
      width: WIDTH,
      height: HEIGHT,
      outDir: pngDir,
      fontSize: 47, // 4-5 items max => bigger, phone-feed-readable body type
      title: req.pkg.title,
      footer: "",
      lines: req.pkg.captionLines
        .filter((l) => !l.text.toLowerCase().includes("curio"))
        .slice(0, 5)
        .map((l, i) => ({ id: `i${i}`, text: l.text.replace(/\s+/g, " ").trim(), emphasis: l.emphasis })),
    }));
    execFileSync(this.toolPath, [specPath], { timeout: 60_000 });
    const cardPng = join(pngDir, "card.png");
    if (!existsSync(cardPng)) throw new Error("card png was not produced");

    // Footer as its own overlay (rendered via lines mode, dimmed in ffmpeg).
    const footerSpec = join(pngDir, "footer-spec.json");
    writeFileSync(footerSpec, JSON.stringify({
      width: WIDTH,
      outDir: pngDir,
      fontSize: 30,
      lines: [{ id: "footer", text: req.pkg.cta, emphasis: "" }],
    }));
    execFileSync(this.toolPath, [footerSpec], { timeout: 60_000 });
    const footerPng = join(pngDir, "footer.png");
    if (!existsSync(footerPng)) throw new Error("footer png was not produced");

    const DURATION = 6.0;
    const providedBed = ["assets/bed.mp3", "assets/bed.m4a", "assets/bed.wav", ...DRONE_CANDIDATES]
      .map((p) => resolve(p))
      .find((p) => existsSync(p));
    const bed = providedBed ?? this.ensureSynthBed(DURATION);
    const bedVolume = providedBed ? 0.35 : 1.0; // synth bed is pre-leveled

    const footerFadeIn = (DURATION * 0.62).toFixed(2);
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    args.push("-loop", "1", "-t", String(DURATION), "-i", cardPng);   // [0]
    args.push("-i", bed);                                             // [1]
    args.push("-loop", "1", "-t", String(DURATION), "-i", footerPng); // [2]
    args.push(
      "-filter_complex",
      [
        // Slow push-in: controlled ambient motion so the frame is alive.
        `[0:v]zoompan=z='min(1.035,1+0.0002*on)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS},noise=alls=3:allf=t[bg]`,
        // Signature appears only for the final ~2s, dimmed.
        `[2:v]format=rgba,colorchannelmixer=aa=0.7,fade=t=in:st=${footerFadeIn}:d=0.7:alpha=1[foot]`,
        `[bg][foot]overlay=x=(W-w)/2:y=H*0.86-h[vv]`,
        `[vv]format=yuv420p[v]`,
        `[1:a]atrim=0:${DURATION},volume=${bedVolume},afade=t=in:st=0:d=0.6,afade=t=out:st=${(DURATION - 1.0).toFixed(2)}:d=1.0[a]`,
      ].join(";"),
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
    assertAudible(outPath); // a silent track must never reach the review queue
    this.results.set(providerVideoId, {
      providerVideoId,
      status: "completed",
      videoUrl: `/videos/${providerVideoId}.mp4`,
    });
    return { providerVideoId };
  }

  /**
   * Synthesized dark ambient bed: two slowly-beating low sines + lowpassed
   * brown noise with a gentle tremolo. Placeholder quality — a licensed bed at
   * assets/bed.mp3 always wins — but it is REAL sound; cards must never ship
   * silent. Cached per duration.
   */
  private ensureSynthBed(duration: number): string {
    const path = join(this.dirs.tmp, `synth_bed_${duration.toFixed(1)}s.m4a`);
    if (existsSync(path)) return path;
    const d = duration.toFixed(2);
    const res = spawnSync("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `sine=frequency=52:duration=${d}`,
      "-f", "lavfi", "-i", `sine=frequency=52.7:duration=${d}`,
      "-f", "lavfi", "-i", `anoisesrc=colour=brown:duration=${d}:amplitude=0.35:seed=71`,
      "-filter_complex",
      [
        `[2:a]lowpass=f=170,volume=0.55[noise]`,
        `[0:a][1:a]amix=inputs=2:duration=first,volume=0.6[drone]`,
        `[drone][noise]amix=inputs=2:duration=first,tremolo=f=0.13:d=0.35,volume=0.5[a]`,
      ].join(";"),
      "-map", "[a]", "-c:a", "aac", "-b:a", "128k", path,
    ], { encoding: "utf8", timeout: 60_000 });
    if (res.status !== 0 || !existsSync(path)) {
      throw new Error(`synth bed failed: ${(res.stderr || "unknown").slice(-300)}`);
    }
    return path;
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

/**
 * Quality gate: reject outputs whose audio is effectively silent. A silent
 * track is worse than no track — "audio stream exists" checks pass it while
 * the platform buries the post. mean_volume below -55 dB over the whole file
 * means nothing audible was mixed in.
 */
export function assertAudible(path: string): void {
  const res = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", path, "-af", "volumedetect", "-vn", "-f", "null", "-"],
    { encoding: "utf8", timeout: 60_000 },
  );
  const out = `${res.stderr}\n${res.stdout}`;
  const m = out.match(/mean_volume:\s*(-?[\d.]+|inf|-inf)\s*dB/i);
  const mean = m ? Number(m[1].replace(/^-?inf$/i, "-999")) : NaN;
  if (!Number.isFinite(mean) || mean < -55) {
    throw new Error(
      `render produced a silent/near-silent audio track (mean_volume=${m?.[1] ?? "unreadable"} dB) — refusing to queue it`,
    );
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
