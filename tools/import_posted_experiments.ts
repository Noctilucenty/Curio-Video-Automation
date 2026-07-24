// Import Curio's REAL posted videos (data/posted-experiments.json) into the
// factory repo so the learning engine trains on actual results instead of an
// empty store. These posts were produced externally (Captions.ai), so the
// Video rows are reconstructions: honest where we have data, minimal where we
// don't — the dataset JSON stays the source of truth for full creative detail.
//
// Update semantics: metric rows are CONTENT-ADDRESSED (id carries a hash of
// the row's values). Correcting posted-experiments.json produces a new row id
// with a newer ingestedAt, and learning's latest-per-(video,platform,surface)
// rule supersedes the stale one. Re-running with unchanged data refreshes the
// existing row's ingestedAt instead of skipping it, so REVERTING a correction
// (A→B→A) also re-selects the original row — the current dataset content is
// always the latest stream, whatever the edit history.
//
// PLATFORM SEPARATION (hard rule): a metrics row is only written when the
// INSTAGRAM view count is known. Combined IG+FB totals never enter the
// learning stream — IG engagement counts over a mixed denominator is exactly
// the corruption the dataset warns about. Experiments missing the split are
// reported so Leon can pull the number from the insights Engagement tab.
//
// Run: npx tsx tools/import_posted_experiments.ts [dataDir] [datasetPath]

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonFileRepo } from "../src/repository.js";
import type { PerformanceMetrics, Topic, Video } from "../src/types.js";

const dataDir = process.argv[2] ?? "./data";
const datasetPath = process.argv[3] ?? "data/posted-experiments.json";
const dataset = JSON.parse(readFileSync(resolve(datasetPath), "utf8"));

function epoch(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00-07:00`).getTime();
}

/** Trim to a word boundary — reconstructed captions must not cut mid-word. */
function wordTrim(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 0 ? cut.slice(0, at) : cut.slice(0, max)).trim();
}

/** null when the IG split is missing — the caller skips the row and warns. */
function metricsFor(exp: any, videoId: string): PerformanceMetrics | null {
  const a = exp.analytics;
  const igViews: number | null = a.viewsInstagram;
  if (igViews == null || !(igViews > 0)) return null;
  const count = (raw: number | undefined, rate: number | null | undefined) =>
    raw ?? (rate != null ? Math.round(igViews * rate) : 0);
  const row = {
    videoId,
    platform: "reels" as const,
    surface: "instagram" as const,
    provenance: "real" as const,
    reach: a.reachInstagram ?? undefined,
    views: igViews,
    // null = the dataset doesn't know — never coerce unknown watch data to 0
    // (the 2026-07-23 rows imported as 0 and had to be quarantined by the
    // learning run's own reasoning).
    avgWatchTime: a.avgWatchTimeSeconds ?? null,
    completionRate: a.retentionAtEnd ?? null,
    skipRate: a.skipRate ?? undefined,
    likes: count(a.likes, a.likeRate),
    comments: count(a.comments, a.commentRate),
    shares: count(a.shares, a.shareRate),
    saves: count(a.saves, a.saveRate),
    follows: 0,
    profileClicks: 0,
    postedAt: epoch(exp.postedAt),
  };
  const hash = createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 8);
  return { ...row, id: `met_${exp.id.replace(/-/g, "_")}_${hash}`, ingestedAt: Date.now() };
}

async function main() {
  const repo = new JsonFileRepo(dataDir);

  for (const exp of dataset.experiments) {
    const slug = exp.id.replace(/-/g, "_");
    const topicId = `top_${slug}`;
    const videoId = `vid_${slug}`;
    const postedAt = epoch(exp.postedAt);
    const category = exp.category ?? "uncategorized";

    const topic: Topic = {
      id: topicId,
      topic: exp.title,
      category,
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
        category,
        targetPlatform: "reels",
        hookOptions: [exp.creative.hookWording],
        selectedHook: exp.creative.hookWording,
        script: `[RECONSTRUCTED — produced externally in Captions.ai; not the actual narration] ${exp.creative.visualTimeline}. Reveal: ${exp.creative.reveal}`,
        sceneDirection: `opening frame: ${exp.creative.openingFrame}. archetype: ${exp.creative.archetype}. audio: ${exp.creative.audio.style} (${exp.creative.audio.integratedLufs} LUFS)`,
        avatarTone: "calm, dark documentary",
        captionLines: [
          { startHint: 0, endHint: 3, text: `[reconstructed] ${wordTrim(exp.creative.hookWording, 60)}`, emphasis: "", position: "lower_center", style: "curio_premium" },
        ],
        title: exp.title,
        thumbnailText: exp.title,
        postCaption: exp.title,
        hashtags: ["#curio", "#mystery", "#psychology"],
        cta: exp.creative.cta,
        estimatedLengthSeconds: exp.creative.durationSeconds,
        // All four posted experiments were retention-first mystery designs
        // (that's what the ledger evaluates them against).
        primaryOutcome: "retention",
        secondaryOutcome: "shares",
        outcomeMoment: `[reconstructed] the reveal: ${exp.creative.reveal}`,
      },
      render: { provider: "mock", status: "completed", videoUrl: exp.sourceFile },
      post: { provider: "captions_ai", status: "completed", videoUrl: exp.sourceFile },
      reviewNote: `imported posted experiment (${dataset.collectedAt}); verdict: ${exp.verdict}`,
      createdAt: postedAt,
      updatedAt: Date.now(),
      publishedAt: postedAt,
    };
    await (existing ? repo.updateVideo(video) : repo.createVideo(video));

    const m = metricsFor(exp, videoId);
    if (!m) {
      console.warn(
        `⚠ ${videoId}: NO metrics row written — Instagram view count missing. ` +
          `Combined IG+FB totals never enter learning. Get the IG-only view count ` +
          `from the Reel insights and add analytics.viewsInstagram.`,
      );
      continue;
    }
    // Latest-wins selection keys on ingestedAt, so the row for the CURRENT
    // dataset content must always carry the newest timestamp. Touching an
    // existing row covers the A→B→A case: reverting a correction re-selects
    // the original row instead of leaving the superseded one active.
    const existingRow = (await repo.listMetrics(videoId)).find((x) => x.id === m.id);
    if (existingRow) {
      existingRow.ingestedAt = Date.now();
      console.log(`unchanged ${videoId} (${m.id}) — refreshed as latest`);
    } else {
      await repo.addMetrics(m);
      console.log(`imported ${videoId} → ${m.id} (IG views ${m.views}, reach ${m.reach ?? "?"})`);
    }
  }

  repo.flush();
  console.log("done — real experiments visible to /api/performance/summary and learning runs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
