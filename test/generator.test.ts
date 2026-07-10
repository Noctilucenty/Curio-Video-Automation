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
      expect(l.text.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
  });

  it("throws PackageValidationError on structurally broken output", async () => {
    const llm: LlmClient = { model: "stub", async generateJson() { return { nope: true }; } };
    await expect(generatePackage(llm, topic, [])).rejects.toThrow(PackageValidationError);
  });
});
