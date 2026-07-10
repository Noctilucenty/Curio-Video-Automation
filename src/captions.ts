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
  maxWordsPerLine: 7,
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
    // Avoid a 1-word orphan chunk: merge back if the previous chunk has room.
    const prev = chunks[chunks.length - 1];
    if (current.length === 1 && prev && prev.split(/\s+/).length < CAPTION_STYLE.maxWordsPerLine) {
      chunks[chunks.length - 1] = `${prev} ${current[0]}`;
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
