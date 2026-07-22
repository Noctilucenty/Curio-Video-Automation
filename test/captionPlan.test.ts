import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../src/llm.js";
import {
  CaptionPlanError,
  checkCaptionPlan,
  deterministicCaptionCards,
  generateCaptionPlan,
  parsePlanText,
  planToText,
} from "../src/captionPlan.js";

// The real MICROGRAVITY-FLAME locked narration (brief, 2026-07-21 21:47 rev).
const SCRIPT =
  "Flames can turn spherical in space. On Earth, gases rise. Air moves underneath. " +
  "Airflow stretches flames upward. In microgravity, buoyant flow fades. Fuel diffuses out. " +
  "Oxygen diffuses in. Flames tend toward spheres. Gravity gives fire its familiar shape.";

const VERBATIM_PLAN = [
  "FLAMES CAN TURN / SPHERICAL IN SPACE",
  "ON EARTH / GASES RISE",
  "AIR MOVES UNDERNEATH",
  "AIRFLOW STRETCHES / FLAMES UPWARD",
  "IN MICROGRAVITY / BUOYANT FLOW FADES",
  "FUEL DIFFUSES OUT",
  "OXYGEN DIFFUSES IN",
  "FLAMES TEND / TOWARD SPHERES",
  "GRAVITY GIVES FIRE / ITS FAMILIAR SHAPE",
].join("\n");

describe("checkCaptionPlan — verbatim contract", () => {
  it("passes a word-for-word plan (the current microgravity brief)", () => {
    const report = checkCaptionPlan(SCRIPT, parsePlanText(VERBATIM_PLAN));
    expect(report.verdict).toBe("PASS");
    expect(report.cards).toHaveLength(9);
    expect(report.cards.every((c) => c.status === "pass")).toBe(true);
    expect(report.plan_problems).toHaveLength(0);
  });

  it("fails a paraphrased card and names the exact divergent word and rule", () => {
    const plan = VERBATIM_PLAN.replace("AIR MOVES UNDERNEATH", "COOL AIR MOVES IN");
    const report = checkCaptionPlan(SCRIPT, parsePlanText(plan));
    expect(report.verdict).toBe("FAIL");
    const bad = report.cards.find((c) => c.display === "COOL AIR MOVES IN");
    expect(bad?.status).toBe("fail");
    expect(bad?.problems.join(" ")).toMatch(/"cool"/);
    expect(bad?.problems.join(" ")).toMatch(/"Air"/);
    expect(bad?.problems.join(" ")).toMatch(/Rule 55\.1/);
  });

  it("escalates a dropped qualifier as a Rule 44 factual blocker", () => {
    const plan = VERBATIM_PLAN.replace(
      "FLAMES CAN TURN / SPHERICAL IN SPACE",
      "FLAMES TURN / SPHERICAL IN SPACE",
    );
    const report = checkCaptionPlan(SCRIPT, parsePlanText(plan));
    expect(report.verdict).toBe("FAIL");
    const bad = report.cards[0];
    expect(bad.status).toBe("fail");
    expect(bad.problems.join(" ")).toMatch(/qualifier/i);
    expect(bad.problems.join(" ")).toMatch(/Rule 44/);
    expect(bad.problems.join(" ")).toMatch(/"can"/);
  });

  it("flags a card that skips narration words, quoting the skipped span", () => {
    const cards = parsePlanText(
      ["FLAMES CAN TURN / SPHERICAL IN SPACE", "GASES RISE"].join("\n"),
    );
    const report = checkCaptionPlan(SCRIPT, cards);
    expect(report.verdict).toBe("FAIL");
    const bad = report.cards[1];
    expect(bad.problems.join(" ")).toMatch(/skipping "On Earth,"/);
    expect(report.plan_problems.join(" ")).toMatch(/uncovered narration/);
  });

  it("does not cascade blame onto clean cards after a paraphrase desync", () => {
    const plan = VERBATIM_PLAN.replace("ON EARTH / GASES RISE", "DOWN ON EARTH / GASES CLIMB");
    const report = checkCaptionPlan(SCRIPT, parsePlanText(plan));
    expect(report.verdict).toBe("FAIL");
    expect(report.cards[1].status).toBe("fail");
    // The following verbatim cards must re-anchor and pass.
    expect(report.cards.slice(2).every((c) => c.status === "pass")).toBe(true);
  });

  it("enforces line, screen, and orphan limits with explicit reasons", () => {
    const report = checkCaptionPlan(
      "One two three four five six seven eight.",
      [
        { lines: ["One two three four five"] },
        { lines: ["six", "seven eight"] },
      ],
    );
    expect(report.verdict).toBe("FAIL");
    expect(report.cards[0].problems.join(" ")).toMatch(/5 words.*ceiling is 4/);
    expect(report.cards[1].problems.join(" ")).toMatch(/one-word orphan/);
  });

  it("requires the frame-zero card to be the complete opening thought (Rule 51)", () => {
    const report = checkCaptionPlan(
      "Flames can turn spherical. It happens in space.",
      parsePlanText(["FLAMES CAN", "TURN SPHERICAL", "IT HAPPENS / IN SPACE"].join("\n")),
    );
    expect(report.verdict).toBe("FAIL");
    expect(report.cards[0].problems.join(" ")).toMatch(/Rule 51/);
  });

  it("warns — before audio lock — when the opening sentence cannot fit one screen", () => {
    const longOpen =
      "This opening sentence has far too many words to fit on a caption screen. Short after.";
    const cards = deterministicCaptionCards(longOpen);
    const report = checkCaptionPlan(longOpen, cards);
    expect(report.warnings.join(" ")).toMatch(/cannot be fixed at the caption stage/);
  });

  it("ignores blank rows and bare-slash rows in plan text", () => {
    const cards = parsePlanText("\n\nFLAMES CAN TURN / SPHERICAL IN SPACE\n / \nON EARTH / GASES RISE\n");
    const report = checkCaptionPlan("Flames can turn spherical in space. On Earth, gases rise.", cards);
    expect(report.verdict).toBe("PASS");
    expect(report.cards).toHaveLength(2);
  });

  it("treats a bare dash as punctuation, not a word or a verbatim mismatch", () => {
    const report = checkCaptionPlan(
      "Flames can turn spherical.",
      parsePlanText("FLAMES CAN - TURN SPHERICAL"),
    );
    const problems = report.cards[0].problems.join(" ");
    expect(problems).not.toMatch(/Rule 55\.1/);
    expect(problems).not.toMatch(/5 words/);
  });

  it("rejects a standalone punctuation-only card instead of silently passing it", () => {
    const report = checkCaptionPlan(
      "Flames can turn spherical.",
      parsePlanText("---\nFLAMES CAN TURN SPHERICAL"),
    );
    expect(report.verdict).toBe("FAIL");
    expect(report.cards[0].problems.join(" ")).toMatch(/contains no caption words/);
    expect(report.cards[1].status).toBe("pass");
  });

  it("never emits a one-word orphan card for a one-word opening sentence", () => {
    const script = "Silence. The engines ran at full power.";
    const cards = deterministicCaptionCards(script);
    const report = checkCaptionPlan(script, cards);
    expect(report.verdict).toBe("PASS");
    expect(cards.every((c) => c.lines.every((l) => l.split(/\s+/).length >= 2))).toBe(true);
  });
});

describe("generateCaptionPlan (mock LLM path)", () => {
  it("produces a verified compliant plan from the narration alone", async () => {
    const generated = await generateCaptionPlan(new MockLlmClient(), SCRIPT);
    expect(generated.report.verdict).toBe("PASS");
    expect(generated.attempts).toBe(1);
    expect(generated.cards.length).toBeGreaterThanOrEqual(5);
    // Round-trip: the emitted plan text re-validates.
    const revalidated = checkCaptionPlan(SCRIPT, parsePlanText(planToText(generated.cards)));
    expect(revalidated.verdict).toBe("PASS");
  });

  it("rejects an empty script with an explicit reason instead of a bare failure", async () => {
    await expect(generateCaptionPlan(new MockLlmClient(), "  ")).rejects.toThrowError(CaptionPlanError);
  });

  it("refuses an implausibly long paste before spending tokens, and says why", async () => {
    const notAScript = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const err = await generateCaptionPlan(new MockLlmClient(), notAScript).catch((e) => e);
    expect(err).toBeInstanceOf(CaptionPlanError);
    expect(err.issues.join(" ")).toMatch(/wrong text was pasted/);
    expect(err.issues.join(" ")).toMatch(/300 words/);
  });
});
