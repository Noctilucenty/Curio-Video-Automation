// HTTP API. Wire format is snake_case (matches what OpenAI emits and what the
// spec documents); domain stays camelCase. Invalid review-queue transitions
// return 409 via the status machine — the queue can't be driven into nonsense.

import { Router } from "express";
import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { Renderer } from "./heygen.js";
import type { JobQueue } from "./queue.js";
import type { Platform, Topic, Video, VideoStatus } from "./types.js";
import { assertTransition, TransitionError } from "./types.js";
import { makeId } from "./config.js";
import { createDraftVideo } from "./pipeline.js";
import { normalizeCaptions, captionsToSrt, CAPTION_STYLE } from "./captions.js";
import { judgePackage, PUBLISH_THRESHOLDS } from "./judge.js";
import { runLearning, LearningDataError, MIN_VIDEOS_FOR_LEARNING } from "./learning.js";

export interface RouteDeps {
  repo: Repo;
  llm: LlmClient;
  renderer: Renderer;
  queue: JobQueue;
}

const PLATFORMS = new Set<Platform>(["tiktok", "reels", "shorts"]);

export function buildRoutes(deps: RouteDeps): Router {
  const { repo, llm, queue } = deps;
  const r = Router();

  // --- Topics ---------------------------------------------------------------

  r.post("/video-topics", async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.topic !== "string" || !b.topic.trim()) {
      res.status(400).json({ error: "topic (string) is required" });
      return;
    }
    const platform = String(b.target_platform ?? "tiktok").toLowerCase() as Platform;
    if (!PLATFORMS.has(platform)) {
      res.status(400).json({ error: "target_platform must be tiktok | reels | shorts" });
      return;
    }
    const topic: Topic = {
      id: makeId("top"),
      topic: b.topic.trim(),
      category: String(b.category ?? "general").trim(),
      targetPlatform: platform,
      tone: String(b.tone ?? "calm, premium, mysterious").trim(),
      targetLengthSeconds: clampLength(Number(b.target_length_seconds) || 15),
      language: String(b.language ?? "en").trim(),
      sourceRef: b.source_ref ? String(b.source_ref) : undefined,
      status: "queued",
      createdAt: Date.now(),
    };
    await repo.createTopic(topic);
    res.status(201).json(topicWire(topic));
  });

  r.get("/video-topics", async (_req, res) => {
    res.json({ topics: (await repo.listTopics()).map(topicWire) });
  });

  // --- Generation -----------------------------------------------------------

  // Accepts {topic_id} for an existing topic, or inline topic fields (creates
  // the topic on the fly). Generation runs in the background queue; poll the
  // video id or watch the review queue.
  r.post("/videos/generate", async (req, res) => {
    const b = req.body ?? {};
    let topic: Topic | null = null;
    if (b.topic_id) {
      topic = await repo.getTopic(String(b.topic_id));
      if (!topic) {
        res.status(404).json({ error: `topic not found: ${b.topic_id}` });
        return;
      }
    } else if (typeof b.topic === "string" && b.topic.trim()) {
      topic = {
        id: makeId("top"),
        topic: b.topic.trim(),
        category: String(b.category ?? "general").trim(),
        targetPlatform: PLATFORMS.has(String(b.target_platform ?? "").toLowerCase() as Platform)
          ? (String(b.target_platform).toLowerCase() as Platform)
          : "tiktok",
        tone: String(b.tone ?? "calm, premium, mysterious").trim(),
        targetLengthSeconds: clampLength(Number(b.target_length_seconds) || 15),
        language: String(b.language ?? "en").trim(),
        sourceRef: b.source_ref ? String(b.source_ref) : undefined,
        status: "queued",
        createdAt: Date.now(),
      };
      await repo.createTopic(topic);
    } else {
      res.status(400).json({ error: "provide topic_id or an inline topic" });
      return;
    }

    const video = await createDraftVideo(repo, topic.id);
    const job = queue.enqueue("generate", { videoId: video.id });
    res.status(202).json({ video_id: video.id, job_id: job.id, status: video.status });
  });

  // --- Videos ---------------------------------------------------------------

  r.get("/videos", async (req, res) => {
    let videos = await repo.listVideos();
    const status = req.query.status ? String(req.query.status) : null;
    if (status) videos = videos.filter((v) => v.status === status);
    res.json({ videos: videos.map(videoWire) });
  });

  r.get("/videos/:id", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    const out: any = videoWire(video);
    if (req.query.include === "generations") {
      out.generations = await repo.listGenerations(video.id);
    }
    res.json(out);
  });

  r.get("/videos/:id/captions.srt", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video?.pkg) { res.status(404).json({ error: "video/package not found" }); return; }
    res.type("text/plain").send(captionsToSrt(video.pkg.captionLines));
  });

  // --- Review actions -------------------------------------------------------

  r.post("/videos/:id/regenerate", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    try {
      if (video.status !== "needs_revision") transition(video, "needs_revision");
    } catch (e) {
      if (e instanceof TransitionError) {
        res.status(409).json({ error: e.message }); return;
      }
      throw e;
    }
    video.reviewNote = req.body?.note ? String(req.body.note) : video.reviewNote;
    await repo.updateVideo(video);
    const job = queue.enqueue("generate", { videoId: video.id });
    res.status(202).json({ video_id: video.id, job_id: job.id, status: video.status });
  });

  // Manual edit: the human outranks the judge. Edits are re-judged for the
  // record and re-rendered (the avatar has to speak the new script), then the
  // video returns to ready_for_review.
  r.post("/videos/:id/edit", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    if (!video.pkg) { res.status(409).json({ error: "video has no package to edit" }); return; }
    if (!["needs_revision", "ready_for_review", "rejected"].includes(video.status)) {
      res.status(409).json({ error: `cannot edit in status ${video.status}` });
      return;
    }
    const b = req.body ?? {};
    if (typeof b.hook === "string" && b.hook.trim()) video.pkg.selectedHook = b.hook.trim();
    if (typeof b.script === "string" && b.script.trim()) video.pkg.script = b.script.trim();
    if (Array.isArray(b.caption_lines)) {
      video.pkg.captionLines = normalizeCaptions(
        b.caption_lines.map((l: any) => ({
          startHint: Number(l.start_hint) || 0,
          endHint: Number(l.end_hint) || 0,
          text: String(l.text ?? ""),
          emphasis: String(l.emphasis ?? ""),
          position: l.position ?? "lower_center",
          style: "curio_premium" as const,
        })),
      );
    }
    video.reviewNote = b.note ? String(b.note) : "manual edit";
    // Route through the machine: (ready_for_review|rejected) -> needs_revision -> generated.
    if (video.status !== "needs_revision") transition(video, "needs_revision");
    transition(video, "generated");
    await repo.updateVideo(video);
    const job = queue.enqueue("finalize_edit", { videoId: video.id });
    res.status(202).json({ video_id: video.id, job_id: job.id, status: video.status });
  });

  r.post("/videos/:id/approve", (req, res) => reviewAction(repo, req, res, "approved"));
  r.post("/videos/:id/reject", (req, res) => reviewAction(repo, req, res, "rejected"));
  r.post("/videos/:id/publish", (req, res) => reviewAction(repo, req, res, "published"));

  // --- Performance + learning ------------------------------------------------

  r.post("/videos/:id/performance", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    if (video.status !== "published") {
      res.status(409).json({ error: `metrics only accepted for published videos (status: ${video.status})` });
      return;
    }
    const b = req.body ?? {};
    for (const k of ["views", "avg_watch_time", "completion_rate"]) {
      if (typeof b[k] !== "number") {
        res.status(400).json({ error: `${k} (number) is required` });
        return;
      }
    }
    const platform = String(b.platform ?? video.pkg?.targetPlatform ?? "tiktok").toLowerCase() as Platform;
    await repo.addMetrics({
      id: makeId("met"),
      videoId: video.id,
      platform: PLATFORMS.has(platform) ? platform : "tiktok",
      views: num(b.views),
      avgWatchTime: num(b.avg_watch_time),
      completionRate: Math.max(0, Math.min(1, num(b.completion_rate))),
      likes: num(b.likes),
      comments: num(b.comments),
      shares: num(b.shares),
      saves: num(b.saves),
      follows: num(b.follows),
      profileClicks: num(b.profile_clicks),
      appDownloads: b.app_downloads != null ? num(b.app_downloads) : undefined,
      postedAt: b.posted_at ? Number(b.posted_at) : video.publishedAt ?? Date.now(),
      ingestedAt: Date.now(),
    });
    res.status(201).json({ ok: true });
  });

  r.post("/learning/run", async (_req, res) => {
    try {
      const run = await runLearning(repo, llm);
      res.status(201).json(run);
    } catch (e) {
      if (e instanceof LearningDataError) {
        res.status(409).json({ error: e.message, minimum: MIN_VIDEOS_FOR_LEARNING });
        return;
      }
      throw e;
    }
  });

  r.get("/learning/rules", async (req, res) => {
    const activeOnly = req.query.active === "true";
    res.json({ rules: await repo.listRules(activeOnly) });
  });

  r.get("/learning/runs", async (_req, res) => {
    res.json({ runs: await repo.listLearningRuns() });
  });

  // --- Queue + meta -----------------------------------------------------------

  r.get("/review-queue", async (_req, res) => {
    const videos = await repo.listVideos();
    const queueStatuses: VideoStatus[] = ["ready_for_review", "needs_revision"];
    res.json({
      videos: videos
        .filter((v) => queueStatuses.includes(v.status))
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map(videoWire),
    });
  });

  r.get("/jobs", (_req, res) => {
    res.json({ jobs: queue.list() });
  });

  r.get("/meta", (_req, res) => {
    res.json({
      llm_model: llm.model,
      renderer: deps.renderer.provider,
      thresholds: PUBLISH_THRESHOLDS,
      caption_style: CAPTION_STYLE,
    });
  });

  return r;

  // -------------------------------------------------------------------------

  async function reviewAction(
    repo: Repo,
    req: { params: { id: string }; body?: any },
    res: any,
    to: VideoStatus,
  ): Promise<void> {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    try {
      transition(video, to);
    } catch (e) {
      if (e instanceof TransitionError) { res.status(409).json({ error: e.message }); return; }
      throw e;
    }
    if (req.body?.reason) video.reviewNote = String(req.body.reason);
    if (to === "published") video.publishedAt = Date.now();
    await repo.updateVideo(video);
    res.json(videoWire(video));
  }
}

function transition(video: Video, to: VideoStatus): void {
  assertTransition(video.status, to);
  video.status = to;
}

// Launch-brief default: 12-16s reels; longer only when the story earns it.
function clampLength(n: number): number {
  return Math.max(10, Math.min(45, Math.round(n)));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function topicWire(t: Topic) {
  return {
    id: t.id, topic: t.topic, category: t.category, target_platform: t.targetPlatform,
    tone: t.tone, target_length_seconds: t.targetLengthSeconds, language: t.language,
    source_ref: t.sourceRef ?? null, status: t.status, created_at: t.createdAt,
  };
}

function videoWire(v: Video) {
  return {
    id: v.id,
    topic_id: v.topicId ?? null,
    status: v.status,
    attempts: v.attempts,
    error: v.error ?? null,
    review_note: v.reviewNote ?? null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
    published_at: v.publishedAt ?? null,
    render: {
      provider: v.render.provider,
      status: v.render.status,
      video_url: v.render.videoUrl ?? null,
      error: v.render.error ?? null,
    },
    judge: v.judge
      ? {
          hook_score: v.judge.hookScore,
          retention_score: v.judge.retentionScore,
          clarity_score: v.judge.clarityScore,
          caption_readability: v.judge.captionReadability,
          brand_fit: v.judge.brandFit,
          viral_potential: v.judge.viralPotential,
          factual_safety: v.judge.factualSafety,
          overall_score: v.judge.overallScore,
          problems: v.judge.problems,
          fix: v.judge.fix,
          pass: v.judge.pass,
        }
      : null,
    package: v.pkg
      ? {
          topic: v.pkg.topic,
          category: v.pkg.category,
          target_platform: v.pkg.targetPlatform,
          hook_options: v.pkg.hookOptions,
          selected_hook: v.pkg.selectedHook,
          script: v.pkg.script,
          scene_direction: v.pkg.sceneDirection,
          avatar_tone: v.pkg.avatarTone,
          caption_lines: v.pkg.captionLines.map((l) => ({
            start_hint: l.startHint, end_hint: l.endHint, text: l.text,
            emphasis: l.emphasis, position: l.position, style: l.style,
          })),
          title: v.pkg.title,
          thumbnail_text: v.pkg.thumbnailText,
          post_caption: v.pkg.postCaption,
          hashtags: v.pkg.hashtags,
          cta: v.pkg.cta,
          estimated_length_seconds: v.pkg.estimatedLengthSeconds,
        }
      : null,
  };
}
