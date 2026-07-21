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
import { LocalObjectStore, type ObjectStore } from "./objectStore.js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { RenderRequest, RenderStatus, Renderer } from "./heygen.js";
import {
  MemoryRenderStore, renderIdempotencyKey, type RenderStore,
} from "./renderStore.js";
import { CAPTION_STYLE } from "./captions.js";
import { makeId } from "./config.js";
import { resolveAudioAsset } from "./audioAssets.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FONT_SIZE = 58;

/**
 * Every render's final audio is normalized to this target and then MEASURED.
 * Curio's own posted videos sat at -16.7..-17.1 LUFS; the one at -9.6 LUFS
 * (+0.6 dBFS true peak — clipping) was the engagement floor. -16 LUFS with
 * -1.5 dBTP headroom is the social-feed sweet spot.
 */
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=7";
/** Long enough for a slow ffmpeg pass; heartbeats extend it while work continues. */
const RENDER_LEASE_MS = 10 * 60_000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}
/** Minimal ffprobe evidence recorded alongside the artifact. */
function probeStreams(p: string): Record<string, unknown> {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_frames,avg_frame_rate",
    "-show_entries", "format=duration", "-of", "json", p], { encoding: "utf8" });
  try { return JSON.parse(r.stdout || "{}"); } catch { return {}; }
}

export class LocalRenderer implements Renderer {
  readonly provider = "local" as const;
  readonly burnsCaptions = true;
  // Audio assets stay process-local ON PURPOSE: the file is written to this
  // container's disk, and the SAME process renders with it moments later. Render
  // STATUS is the thing that must outlive the process, and that now lives in `store`.
  private audio = new Map<string, string>();
  private toolPath: string;
  private dirs: { tmp: string; videos: string; bin: string };
  private store: RenderStore;
  private objects: ObjectStore;
  private owner: string;

  /**
   * @param store durable render state. Defaults to MemoryRenderStore, which is the
   *   TEST/DEV adapter only — production passes a PgRenderStore so the WEB service can
   *   poll a render the WORKER started, and so a worker restart resumes instead of
   *   losing the job.
   */
  constructor(private dataDir: string, store?: RenderStore, owner?: string, objects?: ObjectStore) {
    this.store = store ?? new MemoryRenderStore();
    this.objects = objects ?? new LocalObjectStore(join(dataDir, "videos"));
    this.owner = owner ?? `renderer-${process.env.RENDER_INSTANCE_ID ?? process.pid}`;
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

  /**
   * Register + claim the render BEFORE any work. Two effects that matter:
   *   1. an identical render already completed is REUSED, never re-run
   *   2. a crash leaves a claimable row instead of losing the job entirely
   */
  private async beginRender(req: RenderRequest, providerVideoId: string): Promise<
    { reuse: RenderStatus } | { proceed: true }
  > {
    const audioPath = req.audioAssetId ? this.audio.get(req.audioAssetId) : undefined;
    const key = renderIdempotencyKey({
      script: req.pkg.script,
      captionLines: req.pkg.captionLines,
      audioSha256: audioPath && existsSync(audioPath) ? sha256File(audioPath) : undefined,
      format: req.format ?? "narrated",
    });

    const prior = await this.store.findByIdempotencyKey(key);
    if (prior?.status === "completed" && prior.outputUri) {
      return { reuse: { providerVideoId: prior.id, status: "completed", videoUrl: prior.outputUri } };
    }

    await this.store.create({
      id: providerVideoId, idempotencyKey: key,
      inputHashes: { script: sha256(req.pkg.script), audio: audioPath ? sha256File(audioPath) : null },
    });
    const claimed = await this.store.claim(providerVideoId, this.owner, RENDER_LEASE_MS);
    if (!claimed) {
      throw new Error(`render ${providerVideoId} is leased by another worker`);
    }
    return { proceed: true };
  }

  async createVideo(req: RenderRequest): Promise<{ providerVideoId: string }> {
    const providerVideoId = makeId(req.format === "card" ? "localcard" : "localvid");
    const begun = await this.beginRender(req, providerVideoId);
    if ("reuse" in begun) {
      // An identical render already completed — reuse the artifact. This is what makes
      // a restart free instead of paying for the same encode twice.
      return { providerVideoId: begun.reuse.providerVideoId };
    }
    try {
      return await this.renderInner(req, providerVideoId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.store.fail(providerVideoId, msg, { retryAfterMs: 30_000 });
      throw e;
    }
  }

  private async renderInner(req: RenderRequest, providerVideoId: string): Promise<{ providerVideoId: string }> {
    if (req.format === "card") return this.createCardVideo(req, providerVideoId);
    if (!req.audioAssetId || !this.audio.has(req.audioAssetId)) {
      throw new Error("local renderer needs the ElevenLabs narration (no TTS fallback exists locally)");
    }
    const audioPath = this.audio.get(req.audioAssetId)!;
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
    const droneFile = resolveAudioAsset("drone")?.path;
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
    // Final mix is ALWAYS loudness-normalized — narration-only renders used to
    // ship at whatever level ElevenLabs happened to emit.
    if (droneFile) {
      fc.push(`[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0:weights=1 0.12,afade=t=out:st=${Math.max(0, duration - 1.2).toFixed(2)}:d=1.2,${LOUDNORM}[a]`);
    } else {
      fc.push(`[1:a]${LOUDNORM}[a]`);
    }

    args.push(
      "-filter_complex", fc.join(";"),
      "-map", "[v]",
      "-map", "[a]",
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
    const loud = assertLoudness(outPath); // must land in the social-loudness window
    // CHECKPOINT AFTER: atomic completion. Once this row is `completed` the job is
    // never claimed again, so a restart cannot re-render an artifact that exists.
    await this.publish(providerVideoId, outPath, { ...probeStreams(outPath), loudness: loud });
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

  /**
   * Upload the artifact to durable object storage and only then mark the job
   * completed. Order matters: if the upload fails the job stays claimable and is
   * retried, whereas completing first would leave a "completed" row pointing at a
   * file that dies with this container.
   */
  private async publish(
    providerVideoId: string, outPath: string, probe: Record<string, unknown>,
  ): Promise<void> {
    const key = `${providerVideoId}.mp4`;
    const put = await this.objects.put(key, outPath, "video/mp4");
    await this.store.complete(providerVideoId, {
      outputUri: put.uri,
      outputSha256: put.sha256,
      outputBytes: put.bytes,
      probe: { ...probe, storage: this.objects.kind },
    });
  }

  private async createCardVideo(req: RenderRequest, providerVideoId: string): Promise<{ providerVideoId: string }> {
    const outPath = join(this.dirs.videos, `${providerVideoId}.mp4`);
    const pngDir = join(this.dirs.tmp, providerVideoId);

    const footerTool = this.resolveCaptionRasterizer();
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
    execFileSync(footerTool.cmd, footerTool.args(specPath), { timeout: 60_000 });
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
    execFileSync(footerTool.cmd, footerTool.args(footerSpec), { timeout: 60_000 });
    const footerPng = join(pngDir, "footer.png");
    if (!existsSync(footerPng)) throw new Error("footer png was not produced");

    const DURATION = 6.0;
    const bed =
      resolveAudioAsset("bed")?.path ??
      resolveAudioAsset("drone")?.path ??
      this.ensureSynthBed(DURATION);

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
        // Normalize BEFORE the fades: the bed lands at target loudness, then
        // the envelope shapes it. (Normalizing after would fight the fade-out.)
        `[1:a]atrim=0:${DURATION},${LOUDNORM},afade=t=in:st=0:d=0.6,afade=t=out:st=${(DURATION - 1.0).toFixed(2)}:d=1.0[a]`,
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
    assertLoudness(outPath); // silent AND whisper-quiet AND clipping all fail here
    await this.publish(providerVideoId, outPath, probeStreams(outPath));
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

  /**
   * Reads DURABLE state, never renderer memory — this is what lets the web service
   * poll a render the worker started, and what survives the worker being replaced.
   */
  async pollUntilDone(providerVideoId: string): Promise<RenderStatus> {
    const job = await this.store.get(providerVideoId);
    if (!job) {
      return { providerVideoId, status: "failed", error: "unknown local render id" };
    }
    if (job.status === "completed") {
      return { providerVideoId, status: "completed", videoUrl: job.outputUri ?? undefined };
    }
    if (job.status === "failed") {
      return { providerVideoId, status: "failed", error: job.error ?? "render failed" };
    }
    return { providerVideoId, status: "rendering" };
  }

  /** Sweep leases abandoned by workers that died mid-render. */
  async reclaimExpiredRenders(): Promise<number> {
    return this.store.reclaimExpired();
  }

  /** Compile the Swift caption tool once (recompiles when the source is newer). */
  /**
   * Caption rasterizer selection.
   *
   * The Swift/AppKit tool only exists on macOS — `xcrun` and `import AppKit` are both
   * absent on Linux, so a Render container could never render a caption. Pillow is the
   * portable path and is the DEFAULT everywhere it is available; Swift is kept purely
   * as an optional macOS-local adapter (it produces the typography the earlier masters
   * were cut with, so it stays reproducible).
   *
   * Force either with CAPTION_RASTERIZER=python|swift.
   */
  private resolveCaptionRasterizer(): { cmd: string; args: (spec: string) => string[]; kind: string } {
    const forced = process.env.CAPTION_RASTERIZER?.trim().toLowerCase();

    const python = () => {
      const script = resolve("tools/caption_render.py");
      if (!existsSync(script)) throw new Error("tools/caption_render.py missing");
      const bin = process.env.PYTHON_BIN?.trim() || "python3";
      return { cmd: bin, args: (spec: string) => [script, spec], kind: "python" };
    };

    const swift = () => {
      const src = resolve("tools/caption_render.swift");
      if (!existsSync(src)) throw new Error("tools/caption_render.swift missing");
      const stale = !existsSync(this.toolPath) || statSync(this.toolPath).mtimeMs < statSync(src).mtimeMs;
      if (stale) execFileSync("xcrun", ["swiftc", "-O", src, "-o", this.toolPath], { timeout: 120_000 });
      return { cmd: this.toolPath, args: (spec: string) => [spec], kind: "swift" };
    };

    if (forced === "swift") return swift();
    if (forced === "python") return python();

    // Default: python everywhere. Only fall back to Swift if Pillow is genuinely
    // unavailable AND we are on macOS — never silently on Linux, where the fallback
    // cannot work and a clear error is far more useful than a confusing xcrun failure.
    try {
      return python();
    } catch (e) {
      if (process.platform !== "darwin") throw e;
      return swift();
    }
  }

  private renderCaptionPngs(outDir: string, lines: Array<{ id: string; text: string; emphasis: string }>): void {
    const tool = this.resolveCaptionRasterizer();
    mkdirSync(outDir, { recursive: true });
    const specPath = join(outDir, "spec.json");
    writeFileSync(specPath, JSON.stringify({ width: WIDTH, outDir, fontSize: FONT_SIZE, lines }));
    execFileSync(tool.cmd, tool.args(specPath), { timeout: 60_000 });
    for (const l of lines) {
      if (!existsSync(join(outDir, `${l.id}.png`))) throw new Error(`caption png missing: ${l.id}`);
    }
  }
}

export interface LoudnessMeasurement {
  /** EBU R128 integrated loudness, LUFS. */
  integrated: number;
  /** True peak, dBFS. */
  truePeak: number;
}

/** Measure integrated loudness + true peak (EBU R128) of a file's audio. */
export function measureLoudness(path: string): LoudnessMeasurement {
  const res = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, "-map", "a:0", "-af", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8", timeout: 120_000 },
  );
  const out = `${res.stderr}\n${res.stdout}`;
  const summary = out.slice(out.lastIndexOf("Summary:"));
  const i = summary.match(/I:\s*(-?[\d.]+|-?inf)\s*LUFS/i);
  const p = summary.match(/Peak:\s*(-?[\d.]+|-?inf)\s*dBFS/i);
  const parse = (m: RegExpMatchArray | null) =>
    m ? Number(m[1].replace(/^-?inf$/i, "-999")) : NaN;
  return { integrated: parse(i), truePeak: parse(p) };
}

/**
 * Loudness-range quality gate. The old binary silence check (-55 dB mean)
 * passed a whisper-quiet track; both of Curio's real audio failures sat
 * OUTSIDE a healthy range, on opposite ends:
 *   - card v1 shipped silent (-inf);
 *   - "Can't Forget Anything" posted at -9.6 LUFS / +0.6 dBTP — clipping.
 * So the gate now requires social-feed loudness: integrated within
 * [-20, -12] LUFS AND true peak <= -0.9 dBTP. Renders are loudnorm'd to
 * -16 LUFS / -1.5 dBTP, so anything outside the window is a real defect.
 */
export const LOUDNESS_RANGE = { minIntegrated: -20, maxIntegrated: -12, maxTruePeak: -0.9 } as const;

export function assertLoudness(path: string): LoudnessMeasurement {
  const m = measureLoudness(path);
  const problems: string[] = [];
  if (!Number.isFinite(m.integrated) || m.integrated < LOUDNESS_RANGE.minIntegrated) {
    problems.push(`integrated ${m.integrated} LUFS is below ${LOUDNESS_RANGE.minIntegrated} (too quiet/silent for a feed)`);
  }
  if (m.integrated > LOUDNESS_RANGE.maxIntegrated) {
    problems.push(`integrated ${m.integrated} LUFS is above ${LOUDNESS_RANGE.maxIntegrated} (too hot)`);
  }
  if (!Number.isFinite(m.truePeak) || m.truePeak > LOUDNESS_RANGE.maxTruePeak) {
    problems.push(`true peak ${m.truePeak} dBFS exceeds ${LOUDNESS_RANGE.maxTruePeak} (clipping risk)`);
  }
  if (problems.length) {
    throw new Error(`render failed the loudness gate — refusing to queue it: ${problems.join("; ")}`);
  }
  return m;
}

function probeDuration(path: string): number {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8", timeout: 30_000 },
  );
  return Number(String(res.stdout).trim());
}
