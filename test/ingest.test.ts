import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import { createDraftVideo, runGenerationPipeline } from "../src/pipeline.js";
import { ingestRawAnalytics, similarity } from "../src/ingest.js";
import { makeId } from "../src/config.js";
import type { Topic, Video } from "../src/types.js";

async function publishedVideo(repo: InMemoryRepo, topicText: string): Promise<Video> {
  const llm = new MockLlmClient();
  const topic: Topic = {
    id: makeId("top"), topic: topicText, category: "psychology",
    targetPlatform: "tiktok", tone: "calm", targetLengthSeconds: 15,
    language: "en", status: "queued", createdAt: Date.now(),
  };
  await repo.createTopic(topic);
  const v = await createDraftVideo(repo, topic.id);
  const done = await runGenerationPipeline({
    repo, llm, renderer: new MockRenderer(), voice: new MockVoice(),
    post: new MockPostProcessor(), avatarId: "a", voiceId: "v",
  }, v.id);
  done.status = "approved" as const;
  await repo.updateVideo(done);
  done.status = "published" as const;
  done.publishedAt = Date.now();
  return repo.updateVideo(done);
}

describe("similarity", () => {
  it("scores identical and contained strings high, unrelated low", () => {
    expect(similarity("They found the ship intact", "They found the ship intact")).toBe(1);
    expect(similarity("found the ship", "They found the ship intact. Every person gone.")).toBeGreaterThanOrEqual(0.9);
    expect(similarity("sleep types quiz", "The Mary Celeste drifted alone")).toBeLessThan(0.2);
  });
});

describe("ingestRawAnalytics (mock parser)", () => {
  it("matches by video_id and stores normalized metrics", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Why silence feels louder at night");
    const raw = `video_id=${video.id} platform=instagram views=12000 avg_watch_time=18.4 completion_rate=42% likes=830 comments=31 shares=97 saves=144 follows=12 profile_clicks=40 skip_rate=58.9`;

    const report = await ingestRawAnalytics(repo, new MockLlmClient(), raw);

    expect(report.matched).toHaveLength(1);
    expect(report.matched[0].match).toBe("id");
    expect(report.unmatched).toHaveLength(0);
    const [m] = await repo.listMetrics(video.id);
    expect(m.views).toBe(12000);
    expect(m.completionRate).toBeCloseTo(0.42);   // "42%" normalized to 0-1
    expect(m.skipRate).toBeCloseTo(0.589);        // "58.9" normalized to 0-1
    expect(m.platform).toBe("reels");             // instagram -> reels alias
    expect(m.saves).toBe(144);
  });

  it("fuzzy-matches by hook text against the published catalogue", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Why the Mary Celeste drifted with nobody aboard");
    await publishedVideo(repo, "Why your brain deletes your earliest memories");
    const hook = video.pkg!.selectedHook;

    const raw = `hook="${hook}" platform=tiktok views=5000 completion_rate=0.5 likes=100 comments=5 shares=20 saves=30`;
    const report = await ingestRawAnalytics(repo, new MockLlmClient(), raw);

    expect(report.matched).toHaveLength(1);
    expect(report.matched[0].video_id).toBe(video.id);
    expect(report.matched[0].match).toBe("hook");
  });

  it("parses CSV with a header row — one entry per line", async () => {
    const repo = new InMemoryRepo();
    const v1 = await publishedVideo(repo, "First csv topic about memory");
    const v2 = await publishedVideo(repo, "Second csv topic about oceans");
    const raw = [
      "video_id,platform,views,completion_rate,likes,comments,shares,saves",
      `${v1.id},tiktok,1000,0.6,50,2,10,20`,
      `${v2.id},shorts,2000,0.3,80,4,12,9`,
    ].join("\n");

    const report = await ingestRawAnalytics(repo, new MockLlmClient(), raw);
    expect(report.matched).toHaveLength(2);
    expect((await repo.listMetrics(v2.id))[0].platform).toBe("shorts");
  });

  it("reports unpublished and unknown videos as unmatched with reasons", async () => {
    const repo = new InMemoryRepo();
    const published = await publishedVideo(repo, "A published one about dreams");
    // an unpublished (ready_for_review) video
    const llm = new MockLlmClient();
    const topic: Topic = {
      id: makeId("top"), topic: "Unpublished topic", category: "psychology",
      targetPlatform: "tiktok", tone: "calm", targetLengthSeconds: 15,
      language: "en", status: "queued", createdAt: Date.now(),
    };
    await repo.createTopic(topic);
    const draft = await createDraftVideo(repo, topic.id);
    await runGenerationPipeline({
      repo, llm, renderer: new MockRenderer(), voice: new MockVoice(),
      post: new MockPostProcessor(), avatarId: "a", voiceId: "v",
    }, draft.id);

    const raw = [
      `video_id=${draft.id} views=10 completion_rate=0.1 likes=1 comments=0 shares=0 saves=0`,
      `video_id=vid_does_not_exist views=10 completion_rate=0.1 likes=1 comments=0 shares=0 saves=0`,
      `hook="totally unrelated text about cooking pasta" views=10 completion_rate=0.1 likes=1 comments=0 shares=0 saves=0`,
    ].join("\n");
    const report = await ingestRawAnalytics(repo, new MockLlmClient(), raw);

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched).toHaveLength(3);
    expect(report.unmatched[0].reason).toContain("not published");
    expect(report.unmatched[1].reason).toContain("no video with id");
    expect(report.unmatched[2].reason).toContain("no published video matches");
    // nothing leaked into the store — published video has no metrics
    expect(await repo.listMetrics(published.id)).toHaveLength(0);
  });

  it("re-ingesting the same video updates the latest picture (no dedupe needed)", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Metrics update flow");
    const base = `video_id=${video.id} completion_rate=0.2 likes=10 comments=0 shares=0 saves=0`;
    await ingestRawAnalytics(repo, new MockLlmClient(), `${base} views=100`);
    await ingestRawAnalytics(repo, new MockLlmClient(), `${base} views=9000`);
    const rows = await repo.listMetrics(video.id);
    expect(rows).toHaveLength(2);
    // learning consumes latest-by-ingestedAt; both rows retained as history
    expect(Math.max(...rows.map((r) => r.views))).toBe(9000);
  });
});
