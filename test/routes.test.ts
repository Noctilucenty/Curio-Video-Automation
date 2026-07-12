import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import { ensureSeedRules } from "../src/learning.js";
import type { Config } from "../src/config.js";
import type { LearningRule } from "../src/types.js";

function testConfig(adminToken: string | null = null, cardsFrozen = false): Config {
  return {
    port: 0, adminToken, dataDir: "./data", renderer: "mock" as const, cardsFrozen,
    openai: { apiKey: null, model: "mock-llm" },
    heygen: { apiKey: null, avatarId: "av", voiceId: "vo" },
    elevenlabs: { apiKey: null, voiceId: "", modelId: "eleven_multilingual_v2" },
    captions: { apiKey: null, apiBase: undefined },
  };
}

async function makeApp(adminToken: string | null = null, cardsFrozen = false) {
  const repo = new InMemoryRepo();
  await ensureSeedRules(repo);
  const { app, queue } = createApp({
    config: testConfig(adminToken, cardsFrozen), repo, llm: new MockLlmClient(), renderer: new MockRenderer(),
    voice: new MockVoice(), post: new MockPostProcessor(),
  });
  return { app, queue, repo };
}

describe("api flow", () => {
  it("topic -> generate -> review -> approve -> publish -> performance", async () => {
    const { app, queue } = await makeApp();

    // create topic
    const topicRes = await request(app).post("/api/video-topics").send({
      topic: "Why your brain remembers embarrassing moments more than compliments",
      category: "psychology", target_platform: "tiktok", target_length_seconds: 28,
    });
    expect(topicRes.status).toBe(201);
    const topicId = topicRes.body.id;

    // enqueue generation
    const genRes = await request(app).post("/api/videos/generate").send({ topic_id: topicId });
    expect(genRes.status).toBe(202);
    const videoId = genRes.body.video_id;
    await queue.drain();

    // full package + passing judge + mock render
    const vid = await request(app).get(`/api/videos/${videoId}`);
    expect(vid.body.status).toBe("ready_for_review");
    expect(vid.body.package.selected_hook.length).toBeGreaterThan(5);
    expect(vid.body.package.caption_lines.length).toBeGreaterThanOrEqual(3);
    expect(vid.body.judge.pass).toBe(true);
    expect(vid.body.render.video_url).toContain("mock.heygen.local");
    // narration + post-process surfaced on the wire, final url points at the
    // captioned/cleaned deliverable
    expect(vid.body.audio.status).toBe("completed");
    expect(vid.body.post.status).toBe("completed");
    expect(vid.body.post.operations).toEqual({ captions: true, cutFillers: true, cutSilences: true });
    expect(vid.body.final_video_url).toContain(".captioned.mp4");

    // shows up in the review queue
    const rq = await request(app).get("/api/review-queue");
    expect(rq.body.videos.map((v: any) => v.id)).toContain(videoId);

    // srt export works
    const srt = await request(app).get(`/api/videos/${videoId}/captions.srt`);
    expect(srt.text).toContain("-->");

    // approve -> publish
    expect((await request(app).post(`/api/videos/${videoId}/approve`)).body.status).toBe("approved");
    expect((await request(app).post(`/api/videos/${videoId}/publish`)).body.status).toBe("published");

    // metrics accepted once published
    const perf = await request(app).post(`/api/videos/${videoId}/performance`).send({
      platform: "tiktok", views: 12000, avg_watch_time: 18.4, completion_rate: 0.42,
      likes: 830, comments: 31, shares: 97, saves: 144, follows: 12, profile_clicks: 40,
    });
    expect(perf.status).toBe(201);

    const badSkip = await request(app).post(`/api/videos/${videoId}/performance`).send({
      platform: "tiktok", views: 12000, avg_watch_time: 18.4, completion_rate: 0.42,
      skip_rate: "not-a-number",
    });
    expect(badSkip.status).toBe(400);
  });

  it("rejects invalid status transitions with 409", async () => {
    const { app, queue } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "test topic" });
    const videoId = gen.body.video_id;
    await queue.drain();

    // publish before approve -> 409 (ready_for_review -> published not allowed)
    expect((await request(app).post(`/api/videos/${videoId}/publish`)).status).toBe(409);
    // metrics before published -> 409
    expect((await request(app).post(`/api/videos/${videoId}/performance`).send({
      views: 1, avg_watch_time: 1, completion_rate: 0.5,
    })).status).toBe(409);
    // approve twice -> second is 409
    await request(app).post(`/api/videos/${videoId}/approve`);
    expect((await request(app).post(`/api/videos/${videoId}/approve`)).status).toBe(409);
  });

  it("regenerate re-runs the pipeline from review", async () => {
    const { app, queue } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "test topic two" });
    const videoId = gen.body.video_id;
    await queue.drain();

    const re = await request(app).post(`/api/videos/${videoId}/regenerate`).send({ note: "hook feels flat" });
    expect(re.status).toBe(202);
    await queue.drain();
    const vid = await request(app).get(`/api/videos/${videoId}`);
    expect(vid.body.status).toBe("ready_for_review");
    expect(vid.body.attempts).toBeGreaterThanOrEqual(2);
    expect(vid.body.review_note).toBe("hook feels flat");
  });

  it("manual edit re-judges, re-renders, and returns to review", async () => {
    const { app, queue, repo } = await makeApp();
    const rule: LearningRule = {
      id: "rule_test", category: "hook", rule: "Use a test rule.",
      source: "learning_run", active: true, runId: "learn_test", createdAt: Date.now(),
    };
    await repo.addRule(rule);
    const gen = await request(app).post("/api/videos/generate").send({ topic: "editable topic" });
    const videoId = gen.body.video_id;
    await queue.drain();
    expect((await repo.getVideo(videoId))!.appliedRuleIds).toContain(rule.id);

    const edit = await request(app).post(`/api/videos/${videoId}/edit`).send({
      hook: "A hand-written hook about memory.",
      script: "A fully hand-written script. Short. Human. Premium.",
    });
    expect(edit.status).toBe(202);
    await queue.drain();

    const vid = await request(app).get(`/api/videos/${videoId}`);
    expect(vid.body.status).toBe("ready_for_review");
    expect(vid.body.package.selected_hook).toBe("A hand-written hook about memory.");
    expect(vid.body.judge).not.toBeNull();
    expect((await repo.getVideo(videoId))!.appliedRuleIds).toBeUndefined();
  });

  it("validates topic input", async () => {
    const { app } = await makeApp();
    expect((await request(app).post("/api/video-topics").send({})).status).toBe(400);
    expect((await request(app).post("/api/video-topics").send({ topic: "x", target_platform: "youtube_longform" })).status).toBe(400);
    expect((await request(app).post("/api/videos/generate").send({})).status).toBe(400);
    expect((await request(app).post("/api/videos/generate").send({ topic_id: "nope" })).status).toBe(404);
  });

  it("paste-analytics ingest matches published videos and feeds the summary", async () => {
    const { app, queue } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "Analytics flow topic about tides" });
    const videoId = gen.body.video_id;
    await queue.drain();
    await request(app).post(`/api/videos/${videoId}/approve`);
    await request(app).post(`/api/videos/${videoId}/publish`);

    const vid = await request(app).get(`/api/videos/${videoId}`);
    const hook = vid.body.package.selected_hook;

    const ingest = await request(app).post("/api/performance/ingest").send({
      raw: `hook="${hook}" platform=instagram views=15000 completion_rate=48% likes=900 comments=40 shares=120 saves=200 avg_watch_time=12.2`,
    });
    expect(ingest.status).toBe(200);
    expect(ingest.body.matched).toHaveLength(1);
    expect(ingest.body.matched[0].video_id).toBe(videoId);

    const summary = await request(app).get("/api/performance/summary");
    expect(summary.body.videos).toHaveLength(1);
    expect(summary.body.videos[0].views).toBe(15000);
    expect(summary.body.videos[0].completion_rate).toBeCloseTo(0.48);
    expect(summary.body.videos[0].engagement_score).toBeGreaterThan(0);

    // garbage in → 200 with per-entry reasons (a report, not an error), nothing stored
    const bad = await request(app).post("/api/performance/ingest").send({
      raw: 'hook="completely unrelated cooking video about pasta sauce" views=1 completion_rate=0.1 likes=0 comments=0 shares=0 saves=0',
    });
    expect(bad.status).toBe(200);
    expect(bad.body.matched).toHaveLength(0);
    expect(bad.body.unmatched).toHaveLength(1);
    expect(bad.body.unmatched[0].reason).toContain("no published video matches");
    expect((await request(app).post("/api/performance/ingest").send({})).status).toBe(400);
  });

  it("refuses card topics and card generation while cards are frozen", async () => {
    const { app } = await makeApp(null, true);
    const topic = await request(app).post("/api/video-topics").send({ topic: "card topic", format: "card" });
    expect(topic.status).toBe(403);
    expect(topic.body.error).toContain("FROZEN");
    const gen = await request(app).post("/api/videos/generate").send({ topic: "card topic", format: "card" });
    expect(gen.status).toBe(403);
    // narrated stays open
    expect((await request(app).post("/api/video-topics").send({ topic: "narrated topic" })).status).toBe(201);
  });

  it("the card freeze also guards regenerate and edit — every pipeline entry point", async () => {
    // build the card BEFORE freezing, then freeze and try the side doors
    const { app, queue, repo } = await makeApp(null, false);
    const gen = await request(app).post("/api/videos/generate").send({ topic: "pre-freeze card", format: "card" });
    const videoId = gen.body.video_id;
    await queue.drain();
    expect((await repo.getVideo(videoId))!.status).toBe("ready_for_review");

    const frozen = createApp({
      config: testConfig(null, true), repo, llm: new MockLlmClient(), renderer: new MockRenderer(),
      voice: new MockVoice(), post: new MockPostProcessor(),
    });
    const re = await request(frozen.app).post(`/api/videos/${videoId}/regenerate`).send({});
    expect(re.status).toBe(403);
    const edit = await request(frozen.app).post(`/api/videos/${videoId}/edit`).send({ hook: "new hook" });
    expect(edit.status).toBe(403);
  });

  it("manual edits cannot render past the factuality gate", async () => {
    const { app, queue, repo } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "clean topic about tides" });
    const videoId = gen.body.video_id;
    await queue.drain();
    expect((await repo.getVideo(videoId))!.status).toBe("ready_for_review");

    // human introduces a contested claim — re-render must be blocked
    const edit = await request(app).post(`/api/videos/${videoId}/edit`).send({
      script: "Ego depletion drains your willpower with every single choice.",
    });
    expect(edit.status).toBe(202);
    await queue.drain();

    const vid = await repo.getVideo(videoId);
    expect(vid!.status).toBe("needs_revision"); // parked, NOT rendered
    expect(vid!.reviewNote).toContain("fact-check blocked render");
  });

  it("enforces the admin token on mutations but keeps reads open", async () => {
    const { app } = await makeApp("secret-token");
    expect((await request(app).get("/api/videos")).status).toBe(200);
    expect((await request(app).post("/api/video-topics").send({ topic: "x" })).status).toBe(401);
    expect((await request(app)
      .post("/api/video-topics")
      .set("authorization", "Bearer secret-token")
      .send({ topic: "x" })).status).toBe(201);
  });
});
