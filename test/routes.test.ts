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
    port: 0, adminToken, dataDir: "./data", intelligenceDir: "./data/viral-intelligence", databaseUrl: null, renderer: "mock" as const, cardsFrozen,
    openai: { apiKey: null, model: "mock-llm" },
    heygen: { apiKey: null, avatarId: "av", voiceId: "vo" },
    elevenlabs: { apiKey: null, voiceId: "", modelId: "eleven_v3" },
    captions: { apiKey: null, apiBase: undefined, captionTemplateId: undefined, supportsCustomCaptionTiming: false },
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
    const { app, queue, repo } = await makeApp();

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
    // captioned deliverable (captions only under the default locked_master policy)
    expect(vid.body.audio.status).toBe("completed");
    expect(vid.body.post.status).toBe("completed");
    expect(vid.body.post.operations).toEqual({ captions: true, cutFillers: false, cutSilences: false, policy: "locked_master" });
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

    // reels without an explicit surface = possibly-combined Meta total → refused
    const combined = await request(app).post(`/api/videos/${videoId}/performance`).send({
      platform: "reels", views: 503, avg_watch_time: 8, completion_rate: 0.3,
    });
    expect(combined.status).toBe(400);
    expect(combined.body.error).toContain("explicit surface");

    // the same numbers WITH a surface are accepted — and "instagram" as the
    // platform label must canonicalize to reels, never fall back to tiktok
    const igOnly = await request(app).post(`/api/videos/${videoId}/performance`).send({
      platform: "instagram", views: 196, reach: 160, avg_watch_time: 8, completion_rate: 0.3,
    });
    expect(igOnly.status).toBe(201);
    const igRow = (await repo.listMetrics(videoId)).find((m) => m.views === 196)!;
    expect(igRow.platform).toBe("reels");
    expect(igRow.surface).toBe("instagram");
    expect(igRow.reach).toBe(160);
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

  it("fix from feedback revises the current package instead of re-brainstorming", async () => {
    const { app, queue, repo } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "targeted revision topic" });
    const videoId = gen.body.video_id;
    await queue.drain();
    const before = (await repo.getVideo(videoId))!;
    const baseScript = before.pkg!.script;
    before.judge = {
      ...before.judge!,
      pass: false,
      problems: ["The final line weakens the loop."],
      fix: "Replace only the ending with a factual loop payoff.",
    };
    await repo.updateVideo(before);

    const fixed = await request(app).post(`/api/videos/${videoId}/fix-feedback`).send({});
    expect(fixed.status).toBe(202);
    expect(fixed.body.mode).toBe("targeted_revision");
    await queue.drain();

    const packageRuns = (await repo.listGenerations(videoId)).filter((g) => g.kind === "package");
    const revisionInput = packageRuns.at(-1)!.input as { user: string };
    expect(revisionInput.user).toContain("REVISION BRANCH");
    expect(revisionInput.user).toContain(JSON.stringify(baseScript));
    expect(revisionInput.user).toContain("Replace only the ending");
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

  it("generates and persists a faceless founder edit kit without creating a rendered video", async () => {
    const { app, repo } = await makeApp();
    const beforeVideos = (await repo.listVideos()).length;
    const response = await request(app).post("/api/founder-videos/kit").send({
      story_seed: "I loved falling into online rabbit holes but hated realizing I remembered nothing afterward.",
      proof_points: ["I built Curio to make scrolling leave a useful idea behind."],
      available_assets: ["Curio feed recording", "card iteration screenshots"],
      target_platform: "reels",
      target_length_seconds: 30,
      delivery_mode: "synthetic_voiceover",
    });
    expect(response.status).toBe(201);
    expect(response.body.kit_id).toMatch(/^fkit_/);
    expect(response.body.kit.edit_beats.length).toBeGreaterThanOrEqual(5);
    expect(response.body.kit.disclosure_note.toLowerCase()).toContain("ai");
    expect((await repo.listVideos()).length).toBe(beforeVideos);

    const listed = await request(app).get("/api/founder-videos/kits");
    expect(listed.body.kits).toHaveLength(1);
    expect(listed.body.kits[0].kit_id).toBe(response.body.kit_id);
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

  it("persists idempotent production gates and records approve/deny decisions", async () => {
    const { app, repo } = await makeApp();
    const input = {
      key: "MICROGRAVITY-FLAME:runtime:v1",
      production_id: "MICROGRAVITY-FLAME",
      stage: "runtime",
      title: "Approve the measured 19-second runtime",
      summary: "Keep the exact approved script; measured caption-safe audio is 19.015 seconds.",
      artifacts: [{
        label: "Take B",
        url: "/production-artifacts/MICROGRAVITY-FLAME/micro-narration-B.mp3",
        kind: "audio",
      }],
      payload: { requested_runtime_seconds: 19 },
    };
    const created = await request(app).post("/api/production-gates").send(input);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      production_id: "MICROGRAVITY-FLAME",
      status: "pending",
      stage: "runtime",
      payload: { requested_runtime_seconds: 19 },
    });

    // A retry with the same stable key returns the original gate, not a duplicate.
    const duplicate = await request(app).post("/api/production-gates").send(input);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);
    expect(await repo.listProductionGates()).toHaveLength(1);

    const approved = await request(app)
      .post(`/api/production-gates/${created.body.id}/approve`)
      .send({ note: "Approved at 19 seconds." });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    expect(approved.body.decision_note).toBe("Approved at 19 seconds.");
    expect(approved.body.decided_at).toEqual(expect.any(Number));

    // Same-decision retries are idempotent; opposing decisions are conflicts.
    expect((await request(app).post(`/api/production-gates/${created.body.id}/approve`).send({})).status).toBe(200);
    expect((await request(app).post(`/api/production-gates/${created.body.id}/deny`).send({})).status).toBe(409);

    const listed = await request(app).get("/api/production-gates?status=approved");
    expect(listed.status).toBe(200);
    expect(listed.body.gates.map((g: any) => g.id)).toEqual([created.body.id]);
  });

  it("validates production gate stages and ignores unsafe artifact URLs", async () => {
    const { app } = await makeApp();
    const badStage = await request(app).post("/api/production-gates").send({
      key: "x", production_id: "P", stage: "anything", title: "T", summary: "S",
    });
    expect(badStage.status).toBe(400);

    const safe = await request(app).post("/api/production-gates").send({
      key: "P:audio:v1", production_id: "P", stage: "audio_story",
      title: "Audio", summary: "Listen",
      artifacts: [{ label: "bad", url: "javascript:alert(1)", kind: "audio" }],
    });
    expect(safe.status).toBe(201);
    expect(safe.body.artifacts).toEqual([]);

    const hosted = await request(app).post("/api/production-gates").send({
      key: "P:audio:v2", production_id: "P", stage: "audio_story",
      title: "Hosted audio", summary: "Listen",
      artifacts: [{ label: "preview", url: "https://cdn.example.com/audio/preview.mp3", kind: "audio" }],
    });
    expect(hosted.status).toBe(201);
    expect(hosted.body.artifacts[0].url).toBe("https://cdn.example.com/audio/preview.mp3");
  });

  it("loads the reviewed topic shortlist and queues a selected topic idempotently", async () => {
    const { app, repo } = await makeApp();
    const found = await request(app).get("/api/topic-discovery");
    expect(found.status).toBe(200);
    expect(found.body.contentSlot).toContain("Wednesday");
    expect(found.body.liveProviders.some((p: string) => p.includes("vidIQ"))).toBe(true);
    expect(found.body.candidates[0].scores.total).toBeGreaterThanOrEqual(found.body.candidates[1].scores.total);
    expect(found.body.screenedOutCount).toBeGreaterThan(0);
    expect(found.body.candidates.every((c: any) => c.recommendation === "recommended")).toBe(true);
    expect(found.body.candidates.every((c: any) => c.scores.total >= 90 && c.scores.storyPower >= 9)).toBe(true);

    const candidate = found.body.candidates.find((c: any) => c.recommendation === "recommended");
    const selected = await request(app)
      .post(`/api/topic-discovery/${candidate.id}/select`)
      .send({ target_platform: "reels" });
    expect(selected.status).toBe(201);
    expect(selected.body.production_status).toBe("queued");
    expect(selected.body.next_gate).toBe("concept_script");
    expect((await repo.listTopics()).find((t) => t.id === selected.body.topic.id)?.sourceRef)
      .toBe(`topic-discovery:${candidate.id}`);

    const duplicate = await request(app)
      .post(`/api/topic-discovery/${candidate.id}/select`)
      .send({ target_platform: "shorts" });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.idempotent).toBe(true);
    expect(duplicate.body.topic.id).toBe(selected.body.topic.id);

    // Rejected research stays in the intelligence file for audit, but does not
    // appear as an idea and cannot be selected by id.
    expect((await request(app).post("/api/topic-discovery/raccoon-lake-rescue/select").send({})).status).toBe(404);
  });

  it("stores versioned platform-separated performance-over-time analyses", async () => {
    const { app, queue } = await makeApp();
    const gen = await request(app).post("/api/videos/generate").send({ topic: "checkpoint memory topic" });
    const videoId = gen.body.video_id;
    await queue.drain();
    await request(app).post(`/api/videos/${videoId}/approve`).send({});
    await request(app).post(`/api/videos/${videoId}/publish`).send({});
    const postedAt = Date.now() - 25 * 3_600_000;
    await request(app).post(`/api/videos/${videoId}/performance`).send({
      platform: "instagram", views: 1000, completion_rate: 0.2, skip_rate: 0.62,
      avg_watch_time: 4, shares: 1, saves: 2, posted_at: postedAt,
    });

    const analyzed = await request(app).post("/api/performance/trends/analyze").send({});
    expect(analyzed.status).toBe(201);
    expect(analyzed.body.version).toBe("performance_trends_v1");
    expect(analyzed.body.payload.streams).toHaveLength(1);
    expect(analyzed.body.payload.streams[0].surface).toBe("instagram");
    expect(analyzed.body.payload.streams[0].weakest_gate).toBe("scroll_stop");
    expect(analyzed.body.payload.streams[0].checkpoints.find((c: any) => c.hours === 24).captured).toBe(true);
    expect(analyzed.body.payload.streams[0].checkpoints.find((c: any) => c.hours === 2).captured).toBe(false);

    const history = await request(app).get("/api/performance/trends");
    expect(history.status).toBe(200);
    expect(history.body.analyses[0].id).toBe(analyzed.body.id);
  });

  it("validates a caption plan against the locked script with explicit per-card reasons", async () => {
    const { app } = await makeApp();
    const script = "Flames can turn spherical in space. On Earth, gases rise.";
    const fail = await request(app).post("/api/captions/validate").send({
      script,
      plan_text: "FIRE CAN TURN / SPHERICAL IN SPACE\nON EARTH / GASES RISE",
    });
    expect(fail.status).toBe(200);
    expect(fail.body.verdict).toBe("FAIL");
    expect(fail.body.cards[0].problems.join(" ")).toMatch(/Rule 55\.1/);

    const pass = await request(app).post("/api/captions/validate").send({
      script,
      plan_text: "FLAMES CAN TURN / SPHERICAL IN SPACE\nON EARTH / GASES RISE",
    });
    expect(pass.status).toBe(200);
    expect(pass.body.verdict).toBe("PASS");

    const missing = await request(app).post("/api/captions/validate").send({ script });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/cards.*plan_text/);
  });

  it("generates a verified caption plan and refuses an empty script explicitly", async () => {
    const { app, repo } = await makeApp();
    const script = "Flames can turn spherical in space. On Earth, gases rise. Gravity gives fire its familiar shape.";
    const res = await request(app).post("/api/captions/plan").send({ script });
    expect(res.status).toBe(201);
    expect(res.body.report.verdict).toBe("PASS");
    expect(res.body.plan_text.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(res.body.plan_id).toMatch(/^cplan_/);
    expect(res.body.prompt_version).toBe("caption_plan_v1_verbatim_grouping");

    const records = await repo.listGenerations(res.body.plan_id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "package",
      promptVersion: "caption_plan_v1_verbatim_grouping",
      model: "mock-llm",
      input: { script },
    });
    expect(records[0].output).toMatchObject({ verdict: "PASS" });

    const empty = await request(app).post("/api/captions/plan").send({ script: "  " });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/script/);
  });
});
