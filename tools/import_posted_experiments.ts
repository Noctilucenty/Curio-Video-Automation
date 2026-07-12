// Import Curio's REAL posted videos (data/posted-experiments.json) into the
// factory repo so the learning engine trains on actual results instead of an
// empty store. These posts were produced externally (Captions.ai), so the
// Video rows are reconstructions: honest where we have data, minimal where we
// don't — the dataset JSON stays the source of truth for full creative detail.
//
// Idempotent: rows use fixed ids derived from the experiment id; re-running
// updates in place. Run: npx tsx tools/import_posted_experiments.ts [dataDir]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonFileRepo } from "../src/repository.js";
import type { PerformanceMetrics, Topic, Video } from "../src/types.js";

const dataDir = process.argv[2] ?? "./data";
const dataset = JSON.parse(readFileSync(resolve("data/posted-experiments.json"), "utf8"));

function epoch(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00-07:00`).getTime();
}

/** Prefer IG-only views (engagement rates are IG signals); fall back to the
 * combined total ONLY when the split is missing, exactly as flagged in the
 * dataset. Counts absent from screenshots are derived as IG views x rate and
 * rounded — the dataset marks these derived. */
function metricsFor(exp: any, videoId: string): PerformanceMetrics {
  const a = exp.analytics;
  const igViews: number | null = a.viewsInstagram;
  const views = igViews ?? a.viewsTotal;
  const count = (raw: number | undefined, rate: number | null | undefined) =>
    raw ?? (igViews != null && rate != null ? Math.round(igViews * rate) : 0);
  return {
    id: `met_${exp.id.replace(/-/g, "_")}`,
    videoId,
    platform: "reels",
    surface: igViews != null ? "instagram" : undefined,
    reach: a.reachInstagram ?? undefined,
    views,
    avgWatchTime: a.avgWatchTimeSeconds ?? 0,
    completionRate: a.retentionAtEnd ?? 0,
    skipRate: a.skipRate ?? undefined,
    likes: count(a.likes, a.likeRate),
    comments: count(a.comments, a.commentRate),
    shares: count(a.shares, a.shareRate),
    saves: count(a.saves, a.saveRate),
    follows: 0,
    profileClicks: 0,
    postedAt: epoch(exp.postedAt),
    ingestedAt: Date.now(),
  } as PerformanceMetrics;
}

async function main() {
  const repo = new JsonFileRepo(dataDir);

  for (const exp of dataset.experiments) {
    const slug = exp.id.replace(/-/g, "_");
    const topicId = `top_${slug}`;
    const videoId = `vid_${slug}`;
    const postedAt = epoch(exp.postedAt);

    const topic: Topic = {
      id: topicId,
      topic: exp.title,
      category: "mystery-psychology",
      targetPlatform: "reels",
      tone: "calm, premium, mysterious",
      targetLengthSeconds: Math.round(exp.creative.durationSeconds),
      language: "en",
      sourceRef: exp.sourceFile,
      format: "narrated",
      status: "used",
      createdAt: postedAt,
    };
    await ((await repo.getTopic(topicId)) ? repo.updateTopic(topic) : repo.createTopic(topic));

    const existing = await repo.getVideo(videoId);
    const video: Video = {
      id: videoId,
      topicId,
      status: "published",
      attempts: 1,
      generationIds: existing?.generationIds ?? [],
      format: "narrated",
      pkg: {
        topic: exp.title,
        category: "mystery-psychology",
        targetPlatform: "reels",
        hookOptions: [exp.creative.hookWording],
        selectedHook: exp.creative.hookWording,
        script: `[reconstructed — produced externally in Captions.ai] ${exp.creative.visualTimeline}. Reveal: ${exp.creative.reveal}`,
        sceneDirection: `opening frame: ${exp.creative.openingFrame}. archetype: ${exp.creative.archetype}. audio: ${exp.creative.audio.style} (${exp.creative.audio.integratedLufs} LUFS)`,
        avatarTone: "calm, dark documentary",
        captionLines: [
          { startHint: 0, endHint: 3, text: exp.creative.hookWording.slice(0, 60), emphasis: "", position: "lower_center", style: "curio_premium" },
        ],
        title: exp.title,
        thumbnailText: exp.title,
        postCaption: exp.title,
        hashtags: ["#curio", "#mystery", "#psychology"],
        cta: exp.creative.cta,
        estimatedLengthSeconds: exp.creative.durationSeconds,
      },
      render: { provider: "mock", status: "completed", videoUrl: exp.sourceFile },
      post: { provider: "captions_ai", status: "completed", videoUrl: exp.sourceFile },
      reviewNote: `imported posted experiment (${dataset.collectedAt}); verdict: ${exp.verdict}`,
      createdAt: postedAt,
      updatedAt: Date.now(),
      publishedAt: postedAt,
    };
    await (existing ? repo.updateVideo(video) : repo.createVideo(video));

    // Latest-wins metrics: replace-by-fixed-id isn't supported, so only add
    // when this exact import row isn't already stored.
    const already = (await repo.listMetrics(videoId)).some((m) => m.id === `met_${slug}`);
    if (!already) await repo.addMetrics(metricsFor(exp, videoId));

    console.log(`imported ${videoId}  (${exp.title})`);
  }

  repo.flush();
  console.log("done — posted experiments are now visible to /api/performance/summary and learning runs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
