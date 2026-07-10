import { describe, it, expect } from "vitest";
import { meetsThresholds, judgePackage, PUBLISH_THRESHOLDS } from "../src/judge.js";
import { MockLlmClient } from "../src/llm.js";
import { judgeSystemPrompt } from "../src/prompts.js";
import type { LearningRule, VideoPackage } from "../src/types.js";

const base = {
  hookScore: 9, retentionScore: 8, clarityScore: 9, captionReadability: 9,
  brandFit: 9, viralPotential: 8, factualSafety: 9, overallScore: 9,
  problems: [], fix: "",
};

describe("publish thresholds", () => {
  it("passes when every gated score meets its minimum", () => {
    expect(meetsThresholds(base)).toBe(true);
  });

  it.each([
    ["hookScore", PUBLISH_THRESHOLDS.hookScore - 1],
    ["captionReadability", PUBLISH_THRESHOLDS.captionReadability - 1],
    ["brandFit", PUBLISH_THRESHOLDS.brandFit - 1],
    ["viralPotential", PUBLISH_THRESHOLDS.viralPotential - 1],
    ["factualSafety", PUBLISH_THRESHOLDS.factualSafety - 1],
  ] as const)("fails when %s drops below threshold", (key, value) => {
    expect(meetsThresholds({ ...base, [key]: value })).toBe(false);
  });

  it("does not gate on retention/clarity/overall (advisory scores)", () => {
    expect(meetsThresholds({ ...base, retentionScore: 2, clarityScore: 2, overallScore: 2 })).toBe(true);
  });
});

const pkg = (over: Partial<VideoPackage> = {}): VideoPackage => ({
  topic: "Why your brain remembers pain better than praise",
  category: "psychology",
  targetPlatform: "tiktok",
  hookOptions: ["a", "b", "c"],
  selectedHook: "Your brain remembers pain better than praise.",
  script: "Your brain remembers pain better than praise. Not because you're weak. Because survival trained it that way.",
  sceneDirection: "dark editorial",
  avatarTone: "calm, premium, mysterious",
  captionLines: [
    { startHint: 0, endHint: 1.8, text: "Your brain remembers pain", emphasis: "pain", position: "lower_center", style: "curio_premium" },
    { startHint: 1.8, endHint: 3.4, text: "better than praise.", emphasis: "praise", position: "lower_center", style: "curio_premium" },
  ],
  title: "The bias that saves bad memories",
  thumbnailText: "Pain sticks",
  postCaption: "This is why bad memories stick harder.",
  hashtags: ["#psychology", "#brain", "#curio"],
  cta: "Curio turns scrolling into things worth remembering.",
  estimatedLengthSeconds: 28,
  ...over,
});

describe("mock judge rubric (offline judge behaves like the real one)", () => {
  const llm = new MockLlmClient();

  it("only injects calibration rules into the judge prompt", () => {
    const rules: LearningRule[] = [
      { id: "rule_hook", category: "hook", rule: "Use concrete tension.", source: "learning_run", active: true, createdAt: 0 },
      { id: "rule_cal", category: "calibration", rule: "Judge viral potential colder.", source: "learning_run", active: true, createdAt: 0 },
    ];

    const prompt = judgeSystemPrompt(rules);

    expect(prompt).toContain("Judge viral potential colder.");
    expect(prompt).not.toContain("Use concrete tension.");
  });

  it("passes a clean Curio-voice package", async () => {
    const { scores } = await judgePackage(llm, pkg());
    expect(scores.pass).toBe(true);
    expect(scores.problems).toEqual([]);
  });

  it("fails brand_fit on banned phrases and reports the problem", async () => {
    const { scores } = await judgePackage(llm, pkg({
      script: "Did you know that your brain remembers pain? Like and follow for more.",
    }));
    expect(scores.brandFit).toBeLessThan(PUBLISH_THRESHOLDS.brandFit);
    expect(scores.pass).toBe(false);
    expect(scores.problems.join(" ")).toContain("banned phrase");
    expect(scores.fix.length).toBeGreaterThan(10);
  });

  it("fails caption_readability on paragraph captions", async () => {
    const { scores } = await judgePackage(llm, pkg({
      captionLines: [{
        startHint: 0, endHint: 4,
        text: "Your brain remembers negative experiences more strongly than positive ones because of negativity bias",
        emphasis: "", position: "lower_center", style: "curio_premium",
      }],
    }));
    expect(scores.captionReadability).toBeLessThan(PUBLISH_THRESHOLDS.captionReadability);
    expect(scores.pass).toBe(false);
  });
});
