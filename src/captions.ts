// The fixed Curio caption system: every video uses the same branded style so
// the feed feels like one product, not random AI output. Rules enforced here
// (not just prompted) because models drift: max words per line, one emphasis
// phrase, emphasis must appear in the line, sane timing.

import type { CaptionLine } from "./types.js";

export const CAPTION_STYLE = {
  name: "curio_premium",
  // Rendering contract for whatever burns the subtitles (HeyGen styles today,
  // ffmpeg/remotion later). Dark editorial + cream type. Brand rule: emphasis
  // comes from WEIGHT + SCALE + timing, never loud color highlights — cream
  // stays cream, the emphasized phrase gets heavier and slightly larger.
  fontFamily: "Inter, SF Pro Display, sans-serif",
  fontWeightBase: 600,
  fontWeightEmphasis: 800,
  emphasisScale: 1.12,
  textColor: "#F5EFE2",
  emphasisColor: "#F5EFE2",
  backgroundColor: "rgba(11,11,15,0.0)",
  strokeColor: "rgba(0,0,0,0.55)",
  // Current Growth OS / locked caption contract: 2-4 words where practical.
  // Four is the generated-line ceiling; a renderer may place at most two such
  // lines on screen after mobile-size verification. The combined screen may
  // never exceed six words, even when each individual line is compliant.
  maxWordsPerLine: 4,
  maxWordsPerScreen: 6,
  maxLinesPerScreen: 2,
  minLineSeconds: 0.8,
  maxLineSeconds: 4.0,
  defaultPosition: "lower_center" as const,
  safeAreaBottomPct: 18, // keep clear of platform UI (captions, sound bar)
  safeAreaTopPct: 12,
} as const;

const WORDS_PER_SECOND = 2.6; // comfortable vertical-video reading pace

export interface CaptionIssue {
  index: number;
  problem: string;
}

/** Validate a caption track against the Curio style contract. */
export function validateCaptions(lines: CaptionLine[]): CaptionIssue[] {
  const issues: CaptionIssue[] = [];
  lines.forEach((line, i) => {
    const words = line.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) issues.push({ index: i, problem: "empty line" });
    if (words.length > CAPTION_STYLE.maxWordsPerLine) {
      issues.push({ index: i, problem: `too many words (${words.length} > ${CAPTION_STYLE.maxWordsPerLine})` });
    }
    if (line.emphasis && !line.text.toLowerCase().includes(line.emphasis.toLowerCase())) {
      issues.push({ index: i, problem: "emphasis phrase not found in text" });
    }
    if (!(line.endHint > line.startHint)) {
      issues.push({ index: i, problem: "end must be after start" });
    }
    const dur = line.endHint - line.startHint;
    if (dur > CAPTION_STYLE.maxLineSeconds) {
      issues.push({ index: i, problem: `line on screen too long (${dur.toFixed(1)}s)` });
    }
  });

  // Per-line limits are insufficient when timed lines overlap: two legal
  // four-word lines would otherwise create an illegal eight-word screen.
  // Evaluate every interval between timing boundaries and report each active
  // combination once. Adjacent captions (one ends as another starts) do not
  // overlap.
  const validTimedLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Number.isFinite(line.startHint)
      && Number.isFinite(line.endHint)
      && line.endHint > line.startHint);
  const boundaries = [...new Set(validTimedLines.flatMap(({ line }) => [line.startHint, line.endHint]))]
    .sort((a, b) => a - b);
  const reported = new Set<string>();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (!(end > start)) continue;
    const active = validTimedLines.filter(({ line }) => line.startHint < end && line.endHint > start);
    if (active.length === 0) continue;
    const key = active.map(({ index }) => index).join(",");
    if (reported.has(key)) continue;
    reported.add(key);
    if (active.length > CAPTION_STYLE.maxLinesPerScreen) {
      issues.push({
        index: active[0].index,
        problem: `too many lines on screen (${active.length} > ${CAPTION_STYLE.maxLinesPerScreen})`,
      });
    }
    const screenWords = active.reduce((total, { line }) => (
      total + line.text.trim().split(/\s+/).filter(Boolean).length
    ), 0);
    if (screenWords > CAPTION_STYLE.maxWordsPerScreen) {
      issues.push({
        index: active[0].index,
        problem: `too many words on screen (${screenWords} > ${CAPTION_STYLE.maxWordsPerScreen})`,
      });
    }
  }
  return issues;
}

/**
 * Repair a model-produced track into a valid one instead of failing the whole
 * generation: split overlong lines on natural beats, re-time from word count,
 * drop bad emphasis rather than bad lines.
 */
export function normalizeCaptions(lines: CaptionLine[]): CaptionLine[] {
  const out: CaptionLine[] = [];
  let cursor = 0;
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    for (const chunk of splitLine(text)) {
      const words = chunk.split(/\s+/).length;
      const dur = clamp(words / WORDS_PER_SECOND, CAPTION_STYLE.minLineSeconds, CAPTION_STYLE.maxLineSeconds);
      const emphasis = line.emphasis && chunk.toLowerCase().includes(line.emphasis.toLowerCase())
        ? line.emphasis
        : "";
      out.push({
        startHint: round1(cursor),
        endHint: round1(cursor + dur),
        text: chunk,
        emphasis,
        position: line.position ?? CAPTION_STYLE.defaultPosition,
        style: "curio_premium",
      });
      cursor += dur;
    }
  }
  return out;
}

/** Split a long line into <=maxWords chunks, preferring punctuation breaks. */
function splitLine(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= CAPTION_STYLE.maxWordsPerLine) return [text];

  const chunks: string[] = [];
  let current: string[] = [];
  for (const w of words) {
    current.push(w);
    const atPunct = /[.,;:!?…]$/.test(w);
    if (current.length >= CAPTION_STYLE.maxWordsPerLine || (atPunct && current.length >= 3)) {
      chunks.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) {
    // Avoid a 1-word orphan chunk: merge back if the previous chunk has room,
    // otherwise rebalance one word from the previous full chunk.
    const prev = chunks[chunks.length - 1];
    const prevWords = prev?.split(/\s+/) ?? [];
    if (current.length === 1 && prev && prevWords.length < CAPTION_STYLE.maxWordsPerLine) {
      chunks[chunks.length - 1] = `${prev} ${current[0]}`;
    } else if (current.length === 1 && prevWords.length > 2) {
      const moved = prevWords.pop()!;
      chunks[chunks.length - 1] = prevWords.join(" ");
      chunks.push(`${moved} ${current[0]}`);
    } else {
      chunks.push(current.join(" "));
    }
  }
  return chunks;
}

/** Export a track as SRT for editors / manual burn-in. */
export function captionsToSrt(lines: CaptionLine[]): string {
  return lines
    .map((l, i) => `${i + 1}\n${srtTime(l.startHint)} --> ${srtTime(l.endHint)}\n${l.text}`)
    .join("\n\n") + "\n";
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
