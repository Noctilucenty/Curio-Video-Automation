import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import type { LlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import { createDraftVideo, runGenerationPipeline } from "../src/pipeline.js";
import { ingestRawAnalytics, similarity } from "../src/ingest.js";
import { latestMetricsByVideo } from "../src/learning.js";
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
    expect(similarity("he", "They found the ship intact.")).toBe(0);
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
    const record = (await repo.listGenerations()).find((g) => g.kind === "ingest")!;
    expect(record.kind).toBe("ingest");
    expect(JSON.stringify(record.input)).toContain("RAW ANALYTICS");
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

  it("falls back from external platform ids to hook matching", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Why abandoned ships become legends");
    const hook = video.pkg!.selectedHook;

    const report = await ingestRawAnalytics(
      repo,
      new MockLlmClient(),
      `video_id=tiktok_736182736 hook="${hook}" platform=tiktok views=5000 completion_rate=0.5 likes=100 comments=5 shares=20 saves=30`,
    );

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

  it("does not attach analytics from tiny hook fragments", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Why the Mary Celeste drifted with nobody aboard");

    const report = await ingestRawAnalytics(
      repo,
      new MockLlmClient(),
      'hook="he" views=10 completion_rate=0.1 likes=1 comments=0 shares=0 saves=0',
    );

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched).toHaveLength(1);
    expect(await repo.listMetrics(video.id)).toHaveLength(0);
  });

  it("reports empty parser output as an unmatched reason", async () => {
    const repo = new InMemoryRepo();
    const llm: LlmClient = {
      model: "empty-parser",
      async generateJson() { return { entries: [] }; },
    };

    const report = await ingestRawAnalytics(repo, llm, "totally unrelated pasted text");

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched[0].reason).toBe("no analytics entries parsed");
    expect((await repo.listGenerations())[0].kind).toBe("ingest");
  });

  it("canonicalizes phrase platform labels from pasted analytics", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Why old ships become legends");

    await ingestRawAnalytics(
      repo,
      new MockLlmClient(),
      `video_id=${video.id} platform="YouTube Shorts" views=1000 completion_rate=0.4 likes=30 comments=1 shares=4 saves=5`,
    );

    const [m] = await repo.listMetrics(video.id);
    expect(m.platform).toBe("shorts");
  });

  it("reports ambiguous fuzzy matches as ambiguous", async () => {
    const repo = new InMemoryRepo();
    const v1 = await publishedVideo(repo, "First ambiguous topic");
    const v2 = await publishedVideo(repo, "Second ambiguous topic");
    v1.pkg!.selectedHook = "Same ambiguous hook.";
    v2.pkg!.selectedHook = "Same ambiguous hook.";
    await repo.updateVideo(v1);
    await repo.updateVideo(v2);

    const report = await ingestRawAnalytics(
      repo,
      new MockLlmClient(),
      'hook="Same ambiguous hook" views=10 completion_rate=0.1 likes=1 comments=0 shares=0 saves=0',
    );

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched[0].reason).toContain("ambiguous hook match");
    expect(await repo.listMetrics()).toHaveLength(0);
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

  it("refuses hint-only entries so zero rows can never override real metrics", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Zero row override protection");
    // real metrics land first
    await ingestRawAnalytics(
      repo, new MockLlmClient(),
      `video_id=${video.id} views=12000 completion_rate=0.62 likes=800 comments=20 shares=90 saves=140`,
    );
    // a hint-only line (mock parser defaults counts to 0, like the LLM's "default 0" rule)
    const report = await ingestRawAnalytics(repo, new MockLlmClient(), `video_id=${video.id}`);

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched[0].reason).toContain("no views value");
    const latest = await latestMetricsByVideo(repo);
    const [m] = latest.get(video.id)!;
    expect(m.views).toBe(12000); // real row survives as the latest picture
    expect(m.completionRate).toBeCloseTo(0.62);
  });

  it("exact hook paste wins even when a near-duplicate sibling scores high", async () => {
    const repo = new InMemoryRepo();
    const v1 = await publishedVideo(repo, "Sibling hook one");
    const v2 = await publishedVideo(repo, "Sibling hook two");
    // Near-duplicates differing by a stopword — token-set similarity ties at 0.9+
    v1.pkg!.selectedHook = "Your brain lies to you about memory. That's not an accident.";
    v2.pkg!.selectedHook = "Your brain lies to you about your memory. That's not an accident.";
    await repo.updateVideo(v1);
    await repo.updateVideo(v2);

    const report = await ingestRawAnalytics(
      repo, new MockLlmClient(),
      `hook="Your brain lies to you about memory. That's not an accident." views=500 completion_rate=0.5 likes=10 comments=1 shares=2 saves=3`,
    );

    expect(report.matched).toHaveLength(1);
    expect(report.matched[0].video_id).toBe(v1.id);
  });

  it("keeps one latest stream per platform for cross-posted videos", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Cross posted everywhere");
    const base = `video_id=${video.id} completion_rate=0.5 likes=10 comments=1 shares=2 saves=3`;
    await ingestRawAnalytics(repo, new MockLlmClient(), `${base} platform=tiktok views=1000`);
    await ingestRawAnalytics(repo, new MockLlmClient(), `${base} platform=instagram views=2000`);
    await ingestRawAnalytics(repo, new MockLlmClient(), `${base} platform=tiktok views=5000`); // updates tiktok only

    const latest = await latestMetricsByVideo(repo);
    const streams = latest.get(video.id)!;
    expect(streams).toHaveLength(2);
    const byPlatform = Object.fromEntries(streams.map((m) => [m.platform, m.views]));
    expect(byPlatform.tiktok).toBe(5000);  // updated
    expect(byPlatform.reels).toBe(2000);   // NOT overwritten by the tiktok update
  });

  it("normalizes epoch-seconds posted_at to milliseconds", async () => {
    const repo = new InMemoryRepo();
    const video = await publishedVideo(repo, "Posted at units");
    const epochSeconds = 1783600000; // ~2026 in seconds
    await ingestRawAnalytics(
      repo, new MockLlmClient(),
      `video_id=${video.id} views=100 completion_rate=0.4 likes=5 comments=0 shares=1 saves=2 posted_at=${epochSeconds}`,
    );
    const [m] = await repo.listMetrics(video.id);
    expect(m.postedAt).toBe(epochSeconds * 1000);
  });
});
