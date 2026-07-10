import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/repository.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice, type VoiceSynth } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import { mockGenerate } from "../src/mockLlm.js";
import type { JsonRequest, LlmClient } from "../src/llm.js";
import { createDraftVideo, runGenerationPipeline, MAX_AUTO_REGENS } from "../src/pipeline.js";
import { makeId } from "../src/config.js";
import type { Topic } from "../src/types.js";

/** Delegates to the deterministic mock, but poisons the first N package
 * generations with a banned phrase so the judge fails them. */
class PoisonedLlm implements LlmClient {
  readonly model = "stub-llm";
  packageCalls = 0;
  constructor(private badAttempts: number) {}
  async generateJson(req: JsonRequest): Promise<unknown> {
    const out: any = mockGenerate(req);
    if (req.purpose === "package") {
      this.packageCalls++;
      if (this.packageCalls <= this.badAttempts) {
        out.script = `Did you know that ${out.script} Like and follow for more.`;
        out.selected_hook = "Did you know your brain is weird?";
      }
    }
    return out;
  }
}

async function setup(llm: LlmClient, voice: VoiceSynth = new MockVoice()) {
  const repo = new InMemoryRepo();
  const topic: Topic = {
    id: makeId("top"), topic: "Why your brain remembers embarrassing moments more than compliments",
    category: "psychology", targetPlatform: "tiktok", tone: "calm", targetLengthSeconds: 28,
    language: "en", status: "queued", createdAt: Date.now(),
  };
  await repo.createTopic(topic);
  const video = await createDraftVideo(repo, topic.id);
  const renderer = new MockRenderer();
  const deps = {
    repo, llm, renderer, voice, post: new MockPostProcessor(),
    avatarId: "av1", voiceId: "vo1",
  };
  return { repo, topic, video, deps, renderer };
}

describe("generation pipeline", () => {
  it("clean generation goes straight to ready_for_review with a rendered url", async () => {
    const { repo, topic, video, deps, renderer } = await setup(new PoisonedLlm(0));
    const done = await runGenerationPipeline(deps, video.id);

    expect(done.status).toBe("ready_for_review");
    expect(done.attempts).toBe(1);
    expect(done.judge?.pass).toBe(true);
    expect(done.render.status).toBe("completed");
    expect(done.render.videoUrl).toMatch(/^https:\/\/mock\.heygen\.local\//);
    // ElevenLabs narration was synthesized, uploaded, and drove the avatar
    expect(done.audio?.status).toBe("completed");
    expect(done.audio?.assetId).toBeTruthy();
    expect(renderer.lastRequest?.audioAssetId).toBe(done.audio?.assetId);
    // Captions.ai step produced the final deliverable (captions + cuts)
    expect(done.post?.status).toBe("completed");
    expect(done.post?.videoUrl).toContain(".captioned.mp4");
    expect(done.post?.operations).toEqual({ captions: true, cutFillers: true, cutSilences: true });
    // package + judge recorded with prompt versions
    const gens = await repo.listGenerations(done.id);
    expect(gens.map((g) => g.kind).sort()).toEqual(["judge", "package"]);
    expect(gens.every((g) => g.promptVersion && g.model === "stub-llm")).toBe(true);
    // topic consumed
    expect((await repo.getTopic(topic.id))?.status).toBe("used");
  });

  it("voice failure falls back to HeyGen TTS but still renders and reviews", async () => {
    const brokenVoice: VoiceSynth = {
      provider: "elevenlabs",
      async synthesize() { throw new Error("elevenlabs 401"); },
    };
    const { video, deps, renderer } = await setup(new PoisonedLlm(0), brokenVoice);
    const done = await runGenerationPipeline(deps, video.id);

    expect(done.status).toBe("ready_for_review");
    expect(done.audio?.status).toBe("failed");
    expect(done.audio?.error).toContain("elevenlabs 401");
    // render proceeded WITHOUT the audio asset (HeyGen TTS fallback)
    expect(renderer.lastRequest?.audioAssetId).toBeUndefined();
    expect(done.render.status).toBe("completed");
  });

  it("failed judge triggers a rewrite with feedback, then passes", async () => {
    const llm = new PoisonedLlm(1);
    const { repo, video, deps } = await setup(llm);
    const done = await runGenerationPipeline(deps, video.id);

    expect(done.status).toBe("ready_for_review");
    expect(done.attempts).toBe(2);
    expect(done.judge?.pass).toBe(true);
    // The rewrite prompt carried the judge's feedback forward
    const gens = await repo.listGenerations(done.id);
    const secondPackage = gens.filter((g) => g.kind === "package")[1];
    expect(JSON.stringify(secondPackage.input)).toContain("previous attempt failed");
    expect(JSON.stringify(secondPackage.input)).toContain("banned phrase");
  });

  it("exhausting the rewrite loop parks the video in needs_revision, unrendered", async () => {
    const { repo, video, deps } = await setup(new PoisonedLlm(99));
    const done = await runGenerationPipeline(deps, video.id);

    expect(done.status).toBe("needs_revision");
    expect(done.attempts).toBe(1 + MAX_AUTO_REGENS);
    expect(done.judge?.pass).toBe(false);
    expect(done.render.status).toBe("not_started");
    // 3 packages + 3 judge calls recorded
    const gens = await repo.listGenerations(done.id);
    expect(gens.filter((g) => g.kind === "package")).toHaveLength(3);
    expect(gens.filter((g) => g.kind === "judge")).toHaveLength(3);
  });

  it("schema-invalid llm output marks the video failed with the validation error", async () => {
    const badLlm: LlmClient = {
      model: "broken",
      async generateJson() { return { topic: "x" }; }, // misses nearly every field
    };
    const { video, deps } = await setup(badLlm);
    const done = await runGenerationPipeline(deps, video.id);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("invalid video package");
  });
});
