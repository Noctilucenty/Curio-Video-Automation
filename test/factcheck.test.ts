import { describe, it, expect } from "vitest";
import { screenContestedClaims, factCheckPackage } from "../src/factcheck.js";
import { MockLlmClient } from "../src/llm.js";
import type { VideoPackage } from "../src/types.js";

function pkgWith(over: Partial<VideoPackage>): VideoPackage {
  return {
    topic: "t", category: "psychology", targetPlatform: "reels",
    hookOptions: ["a", "b", "c"], selectedHook: "A clean, factual hook.",
    script: "The Zeigarnik effect keeps unfinished tasks active in memory.",
    sceneDirection: "dark", avatarTone: "calm",
    captionLines: [
      { startHint: 0, endHint: 2, text: "Zeigarnik effect: open loops stay loud", emphasis: "Zeigarnik effect", position: "lower_center", style: "curio_premium" },
    ],
    title: "Your brain keeps score", thumbnailText: "x", postCaption: "post",
    hashtags: ["#a", "#b", "#c"], cta: "Real rabbit holes live in Curio.",
    estimatedLengthSeconds: 15,
    ...over,
  };
}

describe("deterministic contested-claims screen", () => {
  it("fails ego depletion stated as fact — the exact defect that shipped in card v2", () => {
    const findings = screenContestedClaims(pkgWith({
      captionLines: [
        { startHint: 0, endHint: 2, text: "Ego depletion: each choice drains your willpower", emphasis: "Ego depletion", position: "lower_center", style: "curio_premium" },
      ],
    }));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].verdict).toBe("contested");
    expect(findings[0].issue).toContain("ego depletion");
  });

  it("catches contested claims on every viewer-readable surface", () => {
    expect(screenContestedClaims(pkgWith({ title: "Power posing rewires your hormones" }))).not.toHaveLength(0);
    expect(screenContestedClaims(pkgWith({ script: "You only use 10% of your brain." }))).not.toHaveLength(0);
    expect(screenContestedClaims(pkgWith({ selectedHook: "The marshmallow test predicts your whole life." }))).not.toHaveLength(0);
    expect(screenContestedClaims(pkgWith({ script: "Mood follows posture — always." }))).not.toHaveLength(0);
  });

  it("allows a contested term when the SAME sentence openly flags the dispute", () => {
    const findings = screenContestedClaims(pkgWith({
      script: "Ego depletion is one of psychology's most contested ideas — it failed to replicate.",
    }));
    expect(findings).toHaveLength(0);
  });

  it("passes clean, replicated mechanisms untouched", () => {
    expect(screenContestedClaims(pkgWith({}))).toHaveLength(0);
  });
});

describe("factCheckPackage", () => {
  it("short-circuits on a deterministic hit without calling the LLM", async () => {
    const result = await factCheckPackage(new MockLlmClient(), pkgWith({
      script: "Dopamine detox resets your brain's reward system.",
    }));
    expect(result.pass).toBe(false);
    expect(result.modelUsed).toBe("deterministic-screen");
    expect(result.input).toBeNull(); // no tokens spent
    expect(result.fix).toContain("dopamine detox");
  });

  it("runs the LLM pass on clean packages and fails unattributed 'studies show'", async () => {
    const flagged = await factCheckPackage(new MockLlmClient(), pkgWith({
      script: "Studies show your memory rewrites itself every night.",
    }));
    expect(flagged.pass).toBe(false);
    expect(flagged.modelUsed).toBe("mock-llm");
    expect(flagged.findings[0].verdict).toBe("unsupported");

    const clean = await factCheckPackage(new MockLlmClient(), pkgWith({}));
    expect(clean.pass).toBe(true);
  });

  it("overrules a model that says pass while listing blocking findings", async () => {
    const lyingLlm = {
      model: "stub",
      async generateJson() {
        return {
          pass: true,
          fix: "",
          findings: [{ claim: "x", verdict: "contested", issue: "y", required_fix: "z" }],
        };
      },
    };
    const result = await factCheckPackage(lyingLlm as any, pkgWith({}));
    expect(result.pass).toBe(false);
  });
});
