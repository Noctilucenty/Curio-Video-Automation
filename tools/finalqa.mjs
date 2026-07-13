#!/usr/bin/env node
// Final-video QA gate (docs/curio/PRODUCTION_DOCTRINE.md). Deterministic
// ffprobe/ffmpeg checks on a finished master — run BEFORE any review:
//   node tools/finalqa.mjs <master.mp4> [--min-dur 12] [--max-dur 25]
// Exits non-zero on any automated failure. Also emits the human-check
// artifacts (contact sheet + endpoint pair) next to the input file.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file || !existsSync(file)) {
  console.error("usage: node tools/finalqa.mjs <master.mp4>");
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const MIN_DUR = opt("min-dur", 12), MAX_DUR = opt("max-dur", 25);

const outDir = join(dirname(file), "qa");
mkdirSync(outDir, { recursive: true });
const tag = basename(file).replace(/\.mp4$/, "");

const run = (cmd, a) => execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
// ffmpeg writes all analysis to stderr — always capture both streams, quietly.
const ffTxt = (a) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...a, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};

// --- container ---
const probe = run("ffprobe", ["-v", "error", "-select_streams", "v",
  "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
  "-of", "default=noprint_wrappers=1", file]);
const width = Number(probe.match(/width=(\d+)/)?.[1]);
const height = Number(probe.match(/height=(\d+)/)?.[1]);
const fps = probe.match(/avg_frame_rate=([\d/]+)/)?.[1] ?? "";
const dur = Number(probe.match(/duration=([\d.]+)/)?.[1]);
check("resolution", width === 1080 && height === 1920, `${width}x${height}`);
check("framerate", fps === "30/1", fps);
check("duration", dur >= MIN_DUR && dur <= MAX_DUR, `${dur?.toFixed(2)}s (spec ${MIN_DUR}-${MAX_DUR})`);
const hasAudio = run("ffprobe", ["-v", "error", "-select_streams", "a",
  "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1", file]).includes("audio");
check("audio stream present", hasAudio, hasAudio ? "yes" : "MISSING");

// --- loudness (final combined mix; doctrine #7) ---
const ebFull = ffTxt(["-i", file, "-af", "ebur128=peak=true"]);
const eb = ebFull.slice(ebFull.lastIndexOf("Summary:")); // rolling lines lie; the Summary is truth
const integrated = Number(eb.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
const lra = Number(eb.match(/LRA:\s*([\d.]+) LU/)?.[1]);
const tp = Number(eb.match(/Peak:\s*(-?[\d.]+) dBFS/)?.[1]);
check("integrated loudness", Number.isFinite(integrated) && Math.abs(integrated - -17.1) <= 1.5,
  `${integrated} LUFS (target -17.1 ±1.5)`);
check("true peak", Number.isFinite(tp) && tp <= -1.5, `${tp} dBTP (max -1.5)`);
console.log(`INFO  loudness range  LRA ${lra} LU`);

// --- silence beat in the 50-95% region (doctrine #8) ---
const sil = ffTxt(["-i", file, "-af", "silencedetect=n=-35dB:d=0.35"]);
const silences = [...sil.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_duration:\s*([\d.]+)/g)]
  .map((m) => ({ start: Number(m[1]), durS: Number(m[2]) }));
const beat = silences.find((s) => s.start >= dur * 0.5 && s.start <= dur * 0.95);
check("pre-reveal silence beat", !!beat,
  beat ? `${beat.start.toFixed(2)}s for ${beat.durS.toFixed(2)}s (<-35dB)` : "none found in 50-95% region");

// --- black frames ---
const black = ffTxt(["-i", file, "-vf", "blackdetect=d=0.4:pix_th=0.10", "-an"]);
const blackHits = [...black.matchAll(/black_start:([\d.]+)/g)].map((m) => m[1]);
check("no black segments", blackHits.length === 0,
  blackHits.length ? `black at ${blackHits.join(", ")}s` : "clean");

// --- loop endpoints (doctrine #6) ---
const firstPng = join(outDir, `${tag}-first.png`);
const lastPng = join(outDir, `${tag}-last.png`);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", file,
  "-vf", "select='lt(t,0.05)'", "-fps_mode", "vfr", "-update", "1", firstPng]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", file,
  "-vf", `select='gte(t,${(dur - 0.08).toFixed(2)})'`, "-fps_mode", "vfr", "-update", "1", lastPng]);
const ssimOf = (extra) => {
  const out = ffTxt(["-i", firstPng, "-i", lastPng, "-filter_complex",
    extra ? `[0:v]${extra}[a];[1:v]${extra}[b];[a][b]ssim` : "[0:v][1:v]ssim"]);
  return Number(out.match(/All:([\d.]+)/)?.[1]);
};
const rawSsim = ssimOf(null);
const blurSsim = ssimOf("avgblur=3");
check("loop continuity (blurred SSIM)", Number.isFinite(blurSsim) && blurSsim >= 0.90,
  `blurred ${blurSsim} (min 0.90) | raw ${rawSsim} (grain floor ~0.95)`);

// --- human-check artifacts ---
const sheet = join(outDir, `${tag}-contact-sheet.png`);
const step = dur / 8;
const inputs = [];
for (let i = 0; i < 8; i++) inputs.push("-ss", (step * i + 0.2).toFixed(2), "-i", file);
const fc = Array.from({ length: 8 }, (_, i) => `[${i}:v]scale=180:320,trim=end_frame=1[v${i}]`).join(";")
  + ";" + Array.from({ length: 8 }, (_, i) => `[v${i}]`).join("") + "hstack=inputs=8[o]";
run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", fc, "-map", "[o]", "-frames:v", "1", sheet]);
const pair = join(outDir, `${tag}-endpoints.png`);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", firstPng, "-i", lastPng, "-filter_complex",
  "[0:v]scale=270:480[a];[1:v]scale=270:480[b];[a][b]hstack[o]", "-map", "[o]", pair]);
console.log(`INFO  human checks     contact sheet: ${sheet}`);
console.log(`INFO  human checks     endpoint pair: ${pair}`);
console.log("INFO  human checks     REQUIRED: mobile-size sheet read, full-res matte spot-check, endpoint eyeball, script-to-shot audit");

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\nQA: ${failed.length} FAILURE(S)` : "\nQA: ALL AUTOMATED CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
