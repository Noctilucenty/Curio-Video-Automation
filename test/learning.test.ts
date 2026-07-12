import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import { createDraftVideo, runGenerationPipeline } from "../src/pipeline.js";
import { runLearning, engagementScore, ensureSeedRules, LearningDataError, latestMetricsByVideo } from "../src/learning.js";
import { makeId } from "../src/config.js";
import { SEED_RULES } from "../src/prompts.js";
import type { LearningRule, PerformanceMetrics, Topic } from "../src/types.js";
import type { LlmClient } from "../src/llm.js";

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
  const deps = {
    repo, llm, renderer: new MockRenderer(), voice: new MockVoice(),
    post: new MockPostProcessor(), avatarId: "a", voiceId: "v",
  };
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

describe("metrics provenance", () => {
  it("synthetic rows never reach learning — fake views cannot shape rules", async () => {
    const repo = new InMemoryRepo();
    await repo.addMetrics(metrics("v1", { provenance: "synthetic", views: 999999 }));
    await repo.addMetrics(metrics("v2", { provenance: "real", views: 100 }));
    await repo.addMetrics(metrics("v3", { views: 100 })); // untagged (test/dev helper) passes
    const latest = await latestMetricsByVideo(repo);
    expect(latest.has("v1")).toBe(false);
    expect(latest.has("v2")).toBe(true);
    expect(latest.has("v3")).toBe(true);
  });
});

describe("surface separation", () => {
  it("IG and FB rows on the shared reels platform never overwrite each other", async () => {
    const repo = new InMemoryRepo();
    const t = Date.now();
    await repo.addMetrics(metrics("v1", { platform: "reels", surface: "instagram", views: 196, ingestedAt: t }));
    // FB arrives later — before the surface-aware key it would replace the IG row
    await repo.addMetrics(metrics("v1", { platform: "reels", surface: "facebook", views: 307, ingestedAt: t + 1 }));
    const rows = (await latestMetricsByVideo(repo)).get("v1")!;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.surface))).toEqual(new Set(["instagram", "facebook"]));
    expect(rows.find((r) => r.surface === "instagram")!.views).toBe(196);
  });

  it("a re-sent drop updates only its own (platform, surface) stream", async () => {
    const repo = new InMemoryRepo();
    const t = Date.now();
    await repo.addMetrics(metrics("v1", { platform: "reels", surface: "instagram", views: 196, ingestedAt: t }));
    await repo.addMetrics(metrics("v1", { platform: "reels", surface: "facebook", views: 307, ingestedAt: t + 1 }));
    await repo.addMetrics(metrics("v1", { platform: "reels", surface: "instagram", views: 240, ingestedAt: t + 2 }));
    const rows = (await latestMetricsByVideo(repo)).get("v1")!;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.surface === "instagram")!.views).toBe(240);
    expect(rows.find((r) => r.surface === "facebook")!.views).toBe(307);
  });
});

describe("seed rule sync", () => {
  it("deactivates installed seeds that left SEED_RULES and installs the current set", async () => {
    const repo = new InMemoryRepo();
    // The exact stale rule Codex flagged live in the store: contradicted the
    // current 12-16s policy but survived because ensureSeedRules early-returned.
    await repo.addRule({
      id: "rule_stale_length", category: "length",
      rule: "Default to 25-32 seconds unless the topic genuinely needs more.",
      source: "seed", active: true, createdAt: 1,
    });
    await ensureSeedRules(repo);
    const all = await repo.listRules();
    const stale = all.find((r) => r.id === "rule_stale_length")!;
    expect(stale.active).toBe(false);
    expect(stale.rule).toContain("superseded seed");
    const activeSeeds = all.filter((r) => r.source === "seed" && r.active);
    expect(activeSeeds.length).toBe(SEED_RULES.length);
    expect(activeSeeds.some((r) => r.rule.includes("12-16 seconds"))).toBe(true);

    // Idempotent: a second boot neither duplicates nor re-touches anything.
    await ensureSeedRules(repo);
    const seedsAfter = (await repo.listRules()).filter((r) => r.source === "seed");
    expect(seedsAfter.length).toBe(SEED_RULES.length + 1);
    expect(seedsAfter.filter((r) => r.active).length).toBe(SEED_RULES.length);
  });

  it("never touches manual or learning_run rules", async () => {
    const repo = new InMemoryRepo();
    await repo.addRule({ id: "rule_manual", category: "hook", rule: "manual rule", source: "manual", active: true, createdAt: 1 });
    await repo.addRule({ id: "rule_learned", category: "hook", rule: "learned rule", source: "learning_run", active: true, createdAt: 1 });
    await ensureSeedRules(repo);
    const all = await repo.listRules();
    expect(all.find((r) => r.id === "rule_manual")!.active).toBe(true);
    expect(all.find((r) => r.id === "rule_learned")!.active).toBe(true);
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
    // v2 fields: per-platform lessons + judge calibration notes
    expect(run1.platformNotes.length).toBeGreaterThan(0);
    expect(run1.judgeCalibrationNotes.length).toBeGreaterThan(0);

    const rulesAfter1 = await repo.listRules(true);
    const learned1 = rulesAfter1.filter((r) => r.source === "learning_run");
    expect(learned1.length).toBe(run1.newRuleIds.length);
    // the mock judge said viral>=8 on videos that landed bottom-half, so the
    // run must emit a judge-calibration rule
    expect(learned1.some((r) => r.category === "calibration")).toBe(true);
    // seeds stay active alongside learned rules
    expect(rulesAfter1.some((r) => r.source === "seed")).toBe(true);

    // second run supersedes the first run's rules and links back to it
    const run2 = await runLearning(repo, llm);
    expect(run2.previousRunId).toBe(run1.id);
    const activeLearned = (await repo.listRules(true)).filter((r) => r.source === "learning_run");
    expect(activeLearned.every((r) => r.runId === run2.id)).toBe(true);
    const all = await repo.listRules();
    expect(all.some((r) => r.runId === run1.id && !r.active)).toBe(true);

    // run2's prompt carries the compounding context: history + judge_vs_actual
    const run2Gen = (await repo.listGenerations(run2.id))[0];
    const run2Input = JSON.stringify(run2Gen.input);
    expect(run2Input).toContain(run1.id);              // history references run1
    expect(run2Input).toContain("judge_vs_actual");
    expect(run2Input).toContain("rule_validation");

    // the analysis itself is recorded for prompt A/B history
    const gens = await repo.listGenerations(run1.id);
    expect(gens).toHaveLength(1);
    expect(gens[0].kind).toBe("learning");
  });

  it("validates prior rules via appliedRuleIds cohorts and computes the improvement delta", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], { completionRate: 0.5 - i * 0.05, views: 5000 }));
    }
    const llm = new MockLlmClient();
    const run1 = await runLearning(repo, llm);

    // ensure the next video lands in a later millisecond than run1.createdAt —
    // the before/after cohort split is timestamp-based
    await new Promise((r) => setTimeout(r, 5));

    // videos generated AFTER run1 carry the new rules as their cohort key…
    const [newId] = await seedVideos(repo, 1);
    const newVideo = (await repo.getVideo(newId))!;
    const run1Rules = (await repo.listRules()).filter((r) => r.runId === run1.id && r.category !== "calibration");
    for (const r of run1Rules) expect(newVideo.appliedRuleIds).toContain(r.id);
    // …and calibration rules are NOT part of the generator cohort
    const calRule = (await repo.listRules()).find((r) => r.runId === run1.id && r.category === "calibration")!;
    expect(newVideo.appliedRuleIds).not.toContain(calRule.id);

    // the new video outperforms → run2 sees the cohort + a positive delta
    await repo.addMetrics(metrics(newId, { completionRate: 0.9, saves: 300, views: 5000 }));
    const run2 = await runLearning(repo, llm);
    expect(run2.improvementDelta).toBeGreaterThan(0);
    const run2Input = JSON.stringify((await repo.listGenerations(run2.id))[0].input);
    expect(run2Input).toContain("cohort_avg_engagement");
  });

  it("does not credit old backlog videos to the previous learning run", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], { completionRate: 0.5 - i * 0.05, views: 5000 }));
    }
    const llm = new MockLlmClient();
    const run1 = await runLearning(repo, llm);

    // A pre-run video gets a stronger later analytics row, but it still was not
    // generated under run1's rules and must not become the "after" cohort.
    await repo.addMetrics(metrics(ids[0], { completionRate: 0.95, saves: 400, views: 5000, ingestedAt: Date.now() + 1 }));
    const oldVideo = (await repo.getVideo(ids[0]))!;
    for (const id of run1.newRuleIds) expect(oldVideo.appliedRuleIds ?? []).not.toContain(id);

    const run2 = await runLearning(repo, llm);

    expect(run2.improvementDelta).toBeUndefined();
  });

  it("drops unchanged rules that validation showed below baseline", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    const badRule: LearningRule = {
      id: "rule_bad", category: "hook", rule: "Open with a slow vague context line.",
      source: "learning_run", active: true, runId: "learn_old", createdAt: Date.now(),
    };
    await repo.addRule(badRule);
    for (let i = 0; i < ids.length; i++) {
      const video = (await repo.getVideo(ids[i]))!;
      video.appliedRuleIds = i === ids.length - 1 ? [badRule.id] : [];
      await repo.updateVideo(video);
      await repo.addMetrics(metrics(ids[i], {
        completionRate: i === ids.length - 1 ? 0.1 : 0.7,
        saves: i === ids.length - 1 ? 1 : 100,
        views: 5000,
      }));
    }
    const llm: LlmClient = {
      model: "stub",
      async generateJson() {
        return {
          top_patterns: ["fast concrete hooks won"],
          weak_patterns: ["slow context failed"],
          hook_formulas: ["x", "x", "x", "x", "x"],
          recommended_topics: ["x", "x", "x", "x", "x"],
          caption_recommendations: [],
          platform_notes: [],
          judge_calibration_notes: [],
          best_length_seconds: 15,
          best_categories: ["psychology"],
          best_tone: "calm",
          new_rules: [{ category: "hook", rule: badRule.rule }],
        };
      },
    };

    const run = await runLearning(repo, llm);
    const activeLearned = (await repo.listRules(true)).filter((r) => r.source === "learning_run");

    expect(run.newRuleIds).toHaveLength(0);
    expect(activeLearned.some((r) => r.rule === badRule.rule)).toBe(false);
  });

  it("serializes concurrent learning runs so only one learned rule cohort stays active", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], { completionRate: 0.7 - i * 0.05, views: 5000 }));
    }

    await Promise.all([runLearning(repo, new MockLlmClient()), runLearning(repo, new MockLlmClient())]);

    const activeLearned = (await repo.listRules(true)).filter((r) => r.source === "learning_run");
    expect(new Set(activeLearned.map((r) => r.runId)).size).toBe(1);
  });

  it("tied engagement scores share one midrank percentile instead of a fabricated spread", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    // identical metrics on every video — no real performance signal exists
    for (const id of ids) {
      await repo.addMetrics(metrics(id, { completionRate: 0.5, saves: 50, views: 5000 }));
    }
    const run = await runLearning(repo, new MockLlmClient());
    const genInput = JSON.parse(
      JSON.stringify((await repo.listGenerations(run.id))[0].input),
    ) as { user: string };
    const payload = JSON.parse(genInput.user.slice(genInput.user.indexOf("{")));
    const percentiles = payload.judge_vs_actual.map((j: any) => j.actual_percentile);
    expect(new Set(percentiles).size).toBe(1);
    expect(percentiles[0]).toBe(50);
  });

  it("calibration rules are injected into the judge prompt, not the generator prompt", async () => {
    const repo = new InMemoryRepo();
    await ensureSeedRules(repo);
    const ids = await seedVideos(repo, 5);
    for (let i = 0; i < ids.length; i++) {
      await repo.addMetrics(metrics(ids[i], { completionRate: 0.6 - i * 0.08, views: 8000 }));
    }
    const llm = new MockLlmClient();
    const run = await runLearning(repo, llm);
    const calRule = (await repo.listRules(true)).find((r) => r.category === "calibration");
    expect(calRule).toBeTruthy();
    expect(run.newRuleIds).toContain(calRule!.id);

    const [vidId] = await seedVideos(repo, 1);
    const gens = await repo.listGenerations(vidId);
    const pkgGen = gens.find((g) => g.kind === "package")!;
    const judgeGen = gens.find((g) => g.kind === "judge")!;
    expect(JSON.stringify(judgeGen.input)).toContain("CALIBRATION");
    expect(JSON.stringify(judgeGen.input)).toContain(calRule!.rule.slice(0, 30));
    expect(JSON.stringify(pkgGen.input)).not.toContain(calRule!.rule.slice(0, 30));
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
    await runGenerationPipeline({
      repo, llm, renderer: new MockRenderer(), voice: new MockVoice(),
      post: new MockPostProcessor(), avatarId: "a", voiceId: "v",
    }, v.id);

    const gens = await repo.listGenerations(v.id);
    const pkgGen = gens.find((g) => g.kind === "package")!;
    expect(JSON.stringify(pkgGen.input)).toContain("Learned rules from performance data");
  });
});
