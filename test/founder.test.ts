import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../src/llm.js";
import {
  FOUNDER_KIT_PROMPT_VERSION,
  founderKitSystemPrompt,
  generateFounderVideoKit,
  normalizeFounderVideoInput,
  validateRawFounderKit,
} from "../src/founder.js";
import { mockGenerate } from "../src/mockLlm.js";

const input = normalizeFounderVideoInput({
  story_seed: "I enjoyed scrolling into rabbit holes but hated remembering nothing afterward.",
  proof_points: ["I built Curio to make scrolling leave a useful idea behind."],
  available_assets: ["Curio feed recording", "UI iteration screenshots"],
  target_platform: "reels",
  target_length_seconds: 30,
  delivery_mode: "synthetic_voiceover",
});

describe("faceless founder kit", () => {
  it("generates an evidence-led kit without invoking the video renderer", async () => {
    const generated = await generateFounderVideoKit(new MockLlmClient(), input);
    expect(generated.promptVersion).toBe(FOUNDER_KIT_PROMPT_VERSION);
    expect(generated.kit.selectedHook).toContain("scrolling");
    expect(generated.kit.editBeats.length).toBeGreaterThanOrEqual(5);
    expect(generated.kit.editBeats[0].assetType).toBe("app_capture");
    expect(generated.kit.assetChecklist.some((asset) => asset.source === "curio_capture")).toBe(true);
    expect(generated.kit.disclosureNote.toLowerCase()).toContain("ai");
  });

  it("explicitly bans a fake founder face and unsupported specifics", () => {
    const prompt = founderKitSystemPrompt();
    expect(prompt).toContain("Do not invent a synthetic founder face");
    expect(prompt).toContain("Never invent a timeline");
  });

  it("validates the strict mock payload", () => {
    const raw = mockGenerate({
      system: "", user: "Founder video input JSON:\n{}", schemaName: "curio_founder_video_kit",
      schema: {}, purpose: "package",
    });
    expect(validateRawFounderKit(raw)).toEqual([]);
  });

  it("rejects short or invalid inputs before spending a model call", () => {
    expect(() => normalizeFounderVideoInput({ story_seed: "too short" })).toThrow("story_seed");
    expect(() => normalizeFounderVideoInput({ story_seed: "A sufficiently detailed true story seed.", target_platform: "longform" }))
      .toThrow("target_platform");
  });
});
