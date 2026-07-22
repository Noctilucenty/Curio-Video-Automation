import { describe, it, expect } from "vitest";
import { validateCaptions, normalizeCaptions, captionsToSrt, CAPTION_STYLE } from "../src/captions.js";
import type { CaptionLine } from "../src/types.js";

const line = (text: string, over: Partial<CaptionLine> = {}): CaptionLine => ({
  startHint: 0, endHint: 2, text, emphasis: "", position: "lower_center", style: "curio_premium", ...over,
});

describe("caption validation", () => {
  it("accepts a compliant track", () => {
    expect(validateCaptions([
      line("Your brain remembers pain", { emphasis: "pain" }),
      line("better than praise.", { startHint: 2, endHint: 4 }),
    ])).toEqual([]);
  });

  it("rejects lines over the word ceiling", () => {
    const issues = validateCaptions([
      line("Your brain remembers negative experiences much more strongly than positive ones"),
    ]);
    expect(issues.some((i) => i.problem.includes("too many words"))).toBe(true);
  });

  it("rejects emphasis that is not in the text", () => {
    const issues = validateCaptions([line("better than praise", { emphasis: "survival" })]);
    expect(issues.some((i) => i.problem.includes("emphasis"))).toBe(true);
  });

  it("rejects inverted timing", () => {
    const issues = validateCaptions([line("hello there", { startHint: 3, endHint: 1 })]);
    expect(issues.some((i) => i.problem.includes("end must be after start"))).toBe(true);
  });

  it("rejects more than six total words across overlapping lines", () => {
    const issues = validateCaptions([
      line("four words fit here", { startHint: 0, endHint: 2 }),
      line("three more words", { startHint: 0, endHint: 2 }),
    ]);
    expect(issues.some((i) => i.problem.includes("too many words on screen (7 > 6)"))).toBe(true);
  });

  it("allows six words across two lines and adjacent four-word cards", () => {
    expect(validateCaptions([
      line("three words here", { startHint: 0, endHint: 2 }),
      line("three more here", { startHint: 0, endHint: 2 }),
      line("four adjacent words work", { startHint: 2, endHint: 4 }),
    ])).toEqual([]);
  });

  it("rejects more than two overlapping lines", () => {
    const issues = validateCaptions([
      line("one two", { startHint: 0, endHint: 2 }),
      line("three four", { startHint: 0, endHint: 2 }),
      line("five six", { startHint: 0, endHint: 2 }),
    ]);
    expect(issues.some((i) => i.problem.includes("too many lines on screen (3 > 2)"))).toBe(true);
  });
});

describe("caption normalization", () => {
  it("splits paragraph captions into <=4-word beats and re-times them", () => {
    const out = normalizeCaptions([
      line("Your brain remembers negative experiences more strongly than positive ones because of a psychological mechanism called negativity bias"),
    ]);
    expect(out.length).toBeGreaterThan(1);
    expect(validateCaptions(out)).toEqual([]);
    for (const l of out) {
      expect(l.text.split(/\s+/).length).toBeLessThanOrEqual(CAPTION_STYLE.maxWordsPerLine);
      expect(l.endHint).toBeGreaterThan(l.startHint);
    }
    // Timing is sequential
    for (let i = 1; i < out.length; i++) {
      expect(out[i].startHint).toBeGreaterThanOrEqual(out[i - 1].endHint - 0.01);
    }
  });

  it("drops emphasis that no longer matches its chunk instead of failing", () => {
    const out = normalizeCaptions([
      line("one two three four five six seven eight nine ten", { emphasis: "ten" }),
    ]);
    expect(validateCaptions(out)).toEqual([]);
    // "ten" survives only on the chunk that contains it
    const withEmphasis = out.filter((l) => l.emphasis === "ten");
    for (const l of withEmphasis) expect(l.text.toLowerCase()).toContain("ten");
  });

  it("drops empty lines", () => {
    expect(normalizeCaptions([line("   ")])).toEqual([]);
  });
});

describe("srt export", () => {
  it("renders sequential srt blocks", () => {
    const srt = captionsToSrt([
      line("Your brain remembers pain", { startHint: 0, endHint: 1.8 }),
      line("better than praise.", { startHint: 1.8, endHint: 3.6 }),
    ]);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,800\nYour brain remembers pain");
    expect(srt).toContain("2\n00:00:01,800 --> 00:00:03,600\nbetter than praise.");
  });
});
