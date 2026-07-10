import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { createDraftVideo, runGenerationPipeline } from "../src/pipeline.js";
import { runLearning, engagementScore, ensureSeedRules, LearningDataError } from "../src/learning.js";
import { makeId } from "../src/config.js";
import type { PerformanceMetrics, Topic } from "../src/types.js";

function metrics(videoId: string, over: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    id: makeId("met"), videoId, platform: "tiktok",
    views: 1000, avgWatchTime: 15, completionRate: 0.4,
    likes: 50, comments: 5, shares: 10, saves: 20, follows: 2, profileClicks: 5,
    postedAt: Date.now(), ingestedAt: Date.now(), ...over,
  };
}

async function seedVideos(repo: InMemoryRepo, n: number): Promise<string[]> {
  const llm = new MockLlmClient();
  const deps = { repo, llm, renderer: new MockRenderer(), avatarId: "a", voiceId: "v" };
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const topic: Topic = {
      id: makeId("top"), topic: `Topic number ${i} about the mind`, category: i % 2 ? "psychology" : "history",
      targetPlatform: "tiktok", tone: "calm", targetLengthSeconds: 26 + i,
      language: "en", status: "queued", createdAt: Date.now(),
    };
    await repo.createTopic(topic);
    const v = await createDraftVideo(repo, topic.id);
    await runGenerationPipeline(deps, v.id);
    ids.push(v.id);
  }
  return ids;
}

describe("engagement scoring", () => {
  it("weights completion heavily and saves > shares > likes", () => {
    const base = metrics("v");
    const highCompletion = engagementScore(metrics("v", { completionRate: 0.8 }));
    expect(highCompletion).toBeGreaterThan(engagementScore(base));
    const saves = engagementScore(metrics("v", { saves: 120 }));
    const shares = engagementScore(metrics("v", { shares: 120 }));
    const likes = engagementScore(metrics("v", { likes: 120 }));
    expect(saves).toBeGreaterThan(shares);
    expect(shares).toBeGreaterThan(likes);
  });
});

describe("learning run", () => {
  it("refuses to learn from too little data", async () => {
    const repo = new InMemoryRepo();
    await expect(runLearning(repo, new MockLlmClient())).rejects.toThrow(LearningDataError);
  });

  it("analyzes winners/losers, writes rules, and supersedes the previous run", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 10);
    // spread performance: first ids win, last ids lose
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], {
        completionRate: 0.7 - i * 0.05,
        saves: 200 - i * 18,
        views: 10000,
      }));
    }

    const llm = new MockLlmClient();
    const run1 = await runLearning(repo, llm);
    expect(run1.analyzedVideos).toBe(10);
    expect(run1.hookFormulas.length).toBeGreaterThanOrEqual(5);
    expect(run1.recommendedTopics.length).toBeGreaterThanOrEqual(5);
    expect(run1.newRuleIds.length).toBeGreaterThan(0);

    const rulesAfter1 = await repo.listRules(true);
    const learned1 = rulesAfter1.filter((r) => r.source === "learning_run");
    expect(learned1.length).toBe(run1.newRuleIds.length);
    // seeds stay active alongside learned rules
    expect(rulesAfter1.some((r) => r.source === "seed")).toBe(true);

    // second run supersedes the first run's rules
    const run2 = await runLearning(repo, llm);
    const activeLearned = (await repo.listRules(true)).filter((r) => r.source === "learning_run");
    expect(activeLearned.every((r) => r.runId === run2.id)).toBe(true);
    const all = await repo.listRules();
    expect(all.some((r) => r.runId === run1.id && !r.active)).toBe(true);

    // the analysis itself is recorded for prompt A/B history
    const gens = await repo.listGenerations(run1.id);
    expect(gens).toHaveLength(1);
    expect(gens[0].kind).toBe("learning");
  });

  it("newly learned rules are injected into the next generation prompt", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], { completionRate: 0.7 - i * 0.1, views: 5000 }));
    }
    const llm = new MockLlmClient();
    await runLearning(repo, llm);

    // generate one more video and check its recorded prompt contains a learned rule
    const topic: Topic = {
      id: makeId("top"), topic: "One more topic", category: "psychology",
      targetPlatform: "tiktok", tone: "calm", targetLengthSeconds: 28,
      language: "en", status: "queued", createdAt: Date.now(),
    };
    await repo.createTopic(topic);
    const v = await createDraftVideo(repo, topic.id);
    await runGenerationPipeline({ repo, llm, renderer: new MockRenderer(), avatarId: "a", voiceId: "v" }, v.id);

    const gens = await repo.listGenerations(v.id);
    const pkgGen = gens.find((g) => g.kind === "package")!;
    expect(JSON.stringify(pkgGen.input)).toContain("Learned rules from performance data");
  });
});
