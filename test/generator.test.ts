import { describe, it, expect } from "vitest";
import { validateRawPackage, generatePackage, PackageValidationError } from "../src/generator.js";
import { packageSystemPrompt, PROMPT_VERSIONS } from "../src/prompts.js";
import { MockLlmClient } from "../src/llm.js";
import { mockGenerate } from "../src/mockLlm.js";
import type { LlmClient } from "../src/llm.js";
import type { LearningRule, Topic } from "../src/types.js";
import { validateCaptions } from "../src/captions.js";

const topic: Topic = {
  id: "top_1", topic: "Why your brain remembers pain better than praise",
  category: "psychology", targetPlatform: "tiktok", tone: "calm, premium, mysterious",
  targetLengthSeconds: 28, language: "en", status: "queued", createdAt: 0,
};

describe("package schema validation", () => {
  it("accepts the mock generator's output", () => {
    const raw = mockGenerate({ system: "", user: "Topic: x\nCategory: c\nPlatform: tiktok\nTarget length: 28s", schemaName: "s", schema: {}, purpose: "package" });
    expect(validateRawPackage(raw)).toEqual([]);
  });

  it("collects every missing field", () => {
    const issues = validateRawPackage({ topic: "x", target_platform: "vimeo" });
    expect(issues.join("; ")).toContain("bad target_platform");
    expect(issues.join("; ")).toContain("missing/empty script");
    expect(issues.join("; ")).toContain("need >=3 caption_lines");
    expect(issues.length).toBeGreaterThan(5);
  });

  it("enforces the one-outcome doctrine structurally", () => {
    const good = mockGenerate({ system: "", user: "Topic: x\nCategory: c\nPlatform: tiktok\nTarget length: 28s", schemaName: "s", schema: {}, purpose: "package" }) as any;
    // missing primary outcome
    expect(validateRawPackage({ ...good, primary_outcome: undefined }).join("; ")).toContain("primary_outcome");
    // outcome must be from the enum
    expect(validateRawPackage({ ...good, primary_outcome: "virality" }).join("; ")).toContain("primary_outcome");
    // secondary must differ from primary — one outcome means one
    expect(validateRawPackage({ ...good, secondary_outcome: good.primary_outcome }).join("; "))
      .toContain("secondary_outcome must differ");
    // an absent/trivially short mechanism moment is invalid in code
    // (semantic vagueness like "creates curiosity" is the judge's rejection)
    expect(validateRawPackage({ ...good, outcome_moment: "curiosity" }).join("; "))
      .toContain("outcome_moment");
    // secondary is optional (null) — a single-outcome design is valid
    expect(validateRawPackage({ ...good, secondary_outcome: null })).toEqual([]);
  });
});

describe("generatePackage", () => {
  it("does not inject judge calibration rules into the generator prompt", () => {
    const rules: LearningRule[] = [
      { id: "rule_hook", category: "hook", rule: "Use concrete tension.", source: "learning_run", active: true, createdAt: 0 },
      { id: "rule_cal", category: "calibration", rule: "Judge viral potential colder.", source: "learning_run", active: true, createdAt: 0 },
    ];

    const prompt = packageSystemPrompt(rules);

    expect(prompt).toContain("Use concrete tension.");
    expect(prompt).not.toContain("Judge viral potential colder.");
  });

  it("uses the current growth, caption, and loop-safe conversion contract", () => {
    const prompt = packageSystemPrompt([]);
    expect(prompt).toContain("2-4 words per caption card");
    expect(prompt).toContain("GO DEEPER WITH CURIO");
    expect(prompt).toContain("0.6–0.9s");
    expect(prompt).toContain("OMIT it when there is no loop-safe placement");
    expect(prompt).not.toContain("Silences and fillers get cut in post");
    expect(prompt).not.toContain("one deep clean boom on the Curio");
  });

  it("returns a domain package with normalized, valid captions", async () => {
    const { pkg, promptVersion } = await generatePackage(new MockLlmClient(), topic, []);
    expect(promptVersion).toBe(PROMPT_VERSIONS.package);
    expect(pkg.selectedHook.length).toBeGreaterThan(5);
    expect(pkg.hookOptions.length).toBeGreaterThanOrEqual(3);
    expect(validateCaptions(pkg.captionLines)).toEqual([]);
  });

  it("repairs overlong caption lines instead of failing", async () => {
    const llm: LlmClient = {
      model: "stub",
      async generateJson(req) {
        const out: any = mockGenerate(req);
        out.caption_lines[0].text = "This caption line is way too long and rambles on for far more than seven words total";
        return out;
      },
    };
    const { pkg } = await generatePackage(llm, topic, []);
    expect(validateCaptions(pkg.captionLines)).toEqual([]);
    for (const l of pkg.captionLines) {
      expect(l.text.split(/\s+/).length).toBeLessThanOrEqual(4);
    }
  });

  it("throws PackageValidationError on structurally broken output", async () => {
    const llm: LlmClient = { model: "stub", async generateJson() { return { nope: true }; } };
    await expect(generatePackage(llm, topic, [])).rejects.toThrow(PackageValidationError);
  });
});
