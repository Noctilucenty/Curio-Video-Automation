// HTTP API. Wire format is snake_case (matches what OpenAI emits and what the
// spec documents); domain stays camelCase. Invalid review-queue transitions
// return 409 via the status machine — the queue can't be driven into nonsense.

import { Router } from "express";
import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { Renderer } from "./heygen.js";
import type { VoiceSynth } from "./voice.js";
import type { PostProcessor } from "./postprocess.js";
import type { JobQueue } from "./queue.js";
import type {
  LearningRule,
  Platform,
  ProductionGate,
  ProductionGateArtifact,
  ProductionGateStage,
  ProductionGateStatus,
  Topic,
  Video,
  VideoStatus,
} from "./types.js";
import { assertTransition, TransitionError } from "./types.js";
import { makeId } from "./config.js";
import { createDraftVideo } from "./pipeline.js";
import { normalizeCaptions, captionsToSrt, CAPTION_STYLE } from "./captions.js";
import { PUBLISH_THRESHOLDS } from "./judge.js";
import { runLearning, LearningDataError, MIN_VIDEOS_FOR_LEARNING, latestMetricsByVideo, engagementScore } from "./learning.js";
import { canonicalPlatform, canonicalSurface, ingestRawAnalytics } from "./ingest.js";
import {
  FOUNDER_KIT_PROMPT_VERSION,
  FounderKitValidationError,
  founderKitFromRaw,
  founderKitWire,
  generateFounderVideoKit,
  normalizeFounderVideoInput,
  validateRawFounderKit,
} from "./founder.js";
import {
  CAPTION_PLAN_PROMPT_VERSION,
  CaptionPlanError,
  checkCaptionPlan,
  generateCaptionPlan,
  parsePlanText,
  planToText,
} from "./captionPlan.js";
import { loadTopicDiscoverySnapshot } from "./topicDiscovery.js";

export interface RouteDeps {
  repo: Repo;
  llm: LlmClient;
  renderer: Renderer;
  voice: VoiceSynth;
  post: PostProcessor;
  queue: JobQueue;
  /** Leon 2026-07-12: static cards are frozen — no generation spend on them.
   * Defaults to frozen; unfreeze deliberately via CARDS_FROZEN=0. */
  cardsFrozen?: boolean;
  /** Reviewed imports from live vidIQ/connectors plus Curio's evidence ledger. */
  intelligenceDir?: string;
}

const PLATFORMS = new Set<Platform>(["tiktok", "reels", "shorts"]);
const CARDS_FROZEN_ERROR =
  "card format is FROZEN (Leon 2026-07-12): no card generation spend until an atmospheric-mystery baseline exists. Set CARDS_FROZEN=0 to unfreeze deliberately.";
const PRODUCTION_GATE_STAGES = new Set<ProductionGateStage>([
  "concept_script", "runtime", "audio_story", "visual_preview", "final_master", "posting",
]);

export function buildRoutes(deps: RouteDeps): Router {
  const { repo, llm, queue } = deps;
  const cardsFrozen = deps.cardsFrozen ?? true;
  const intelligenceDir = deps.intelligenceDir ?? "./data/viral-intelligence";
  const r = Router();

  // --- Human production gates ---------------------------------------------

  r.post("/production-gates", async (req, res) => {
    const b = req.body ?? {};
    const key = typeof b.key === "string" ? b.key.trim() : "";
    const productionId = typeof b.production_id === "string" ? b.production_id.trim() : "";
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const summary = typeof b.summary === "string" ? b.summary.trim() : "";
    const stage = String(b.stage ?? "") as ProductionGateStage;
    if (!key || !productionId || !title || !summary || !PRODUCTION_GATE_STAGES.has(stage)) {
      res.status(400).json({
        error: "key, production_id, title, summary, and a valid stage are required",
        stages: [...PRODUCTION_GATE_STAGES],
      });
      return;
    }
    const existing = await repo.getProductionGateByKey(key);
    if (existing) {
      res.json(productionGateWire(existing));
      return;
    }
    const artifacts: ProductionGateArtifact[] = Array.isArray(b.artifacts)
      ? b.artifacts.flatMap((raw: unknown) => normalizeProductionArtifact(raw))
      : [];
    if (artifacts.length > 6) {
      res.status(400).json({ error: "a production gate supports at most 6 artifacts" });
      return;
    }
    const gate: ProductionGate = {
      id: makeId("gate"),
      key,
      productionId,
      stage,
      title,
      summary,
      artifacts,
      status: "pending",
      requestedAt: Date.now(),
      payload: isPlainObject(b.payload) ? b.payload : undefined,
    };
    await repo.createProductionGate(gate);
    res.status(201).json(productionGateWire(gate));
  });

  r.get("/production-gates", async (req, res) => {
    const requested = req.query.status ? String(req.query.status) : null;
    const valid = new Set<ProductionGateStatus>(["pending", "approved", "denied"]);
    if (requested && !valid.has(requested as ProductionGateStatus)) {
      res.status(400).json({ error: "status must be pending | approved | denied" });
      return;
    }
    let gates = await repo.listProductionGates();
    if (requested) gates = gates.filter((g) => g.status === requested);
    res.json({ gates: gates.map(productionGateWire) });
  });

  r.get("/production-gates/:id", async (req, res) => {
    const gate = await repo.getProductionGate(req.params.id);
    if (!gate) { res.status(404).json({ error: "production gate not found" }); return; }
    res.json(productionGateWire(gate));
  });

  r.post("/production-gates/:id/approve", (req, res) =>
    decideProductionGate(repo, req.params.id, "approved", req.body?.note, res));
  r.post("/production-gates/:id/deny", (req, res) =>
    decideProductionGate(repo, req.params.id, "denied", req.body?.note, res));

  // --- Topics ---------------------------------------------------------------

  r.get("/topic-discovery", async (_req, res) => {
    const snapshot = loadTopicDiscoverySnapshot(intelligenceDir);
    if (!snapshot) {
      res.status(503).json({
        error: "no reviewed topic-research snapshot is available; run the live vidIQ research import first",
      });
      return;
    }
    const selected = new Map(
      (await repo.listTopics())
        .filter((t) => t.sourceRef?.startsWith("topic-discovery:"))
        .map((t) => [t.sourceRef!.slice("topic-discovery:".length), t.id]),
    );
    res.json({
      ...snapshot,
      candidates: snapshot.candidates.map((c) => ({ ...c, selected_topic_id: selected.get(c.id) ?? null })),
    });
  });

  r.post("/topic-discovery/:candidateId/select", async (req, res) => {
    const snapshot = loadTopicDiscoverySnapshot(intelligenceDir);
    if (!snapshot) {
      res.status(503).json({ error: "no reviewed topic-research snapshot is available" });
      return;
    }
    const candidate = snapshot.candidates.find((c) => c.id === req.params.candidateId);
    if (!candidate) {
      res.status(404).json({ error: "topic candidate not found in the current research snapshot" });
      return;
    }
    if (candidate.recommendation === "hold") {
      res.status(409).json({ error: `candidate is on hold: ${candidate.productionRisk}` });
      return;
    }
    const sourceRef = `topic-discovery:${candidate.id}`;
    const existing = (await repo.listTopics()).find((t) => t.sourceRef === sourceRef);
    if (existing) {
      res.json({ topic: topicWire(existing), production_status: existing.status, idempotent: true });
      return;
    }
    const platform = String(req.body?.target_platform ?? "reels").toLowerCase() as Platform;
    if (!PLATFORMS.has(platform)) {
      res.status(400).json({ error: "target_platform must be tiktok | reels | shorts" });
      return;
    }
    const topic: Topic = {
      id: makeId("top"),
      topic: candidate.topic,
      category: candidate.category,
      targetPlatform: platform,
      tone: "calm, premium, mysterious",
      targetLengthSeconds: clampLength(candidate.targetLengthSeconds),
      language: "en",
      sourceRef,
      format: "narrated",
      status: "queued",
      createdAt: Date.now(),
    };
    await repo.createTopic(topic);
    res.status(201).json({
      topic: topicWire(topic),
      production_status: "queued",
      next_gate: "concept_script",
      message: "Topic selected and queued for the producer. Research and script must pass the concept/script gate before narration.",
    });
  });

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
    if (b.format === "card" && cardsFrozen) {
      res.status(403).json({ error: CARDS_FROZEN_ERROR });
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
      format: b.format === "card" ? "card" as const : "narrated" as const,
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
      if (b.format === "card" && cardsFrozen) {
        res.status(403).json({ error: CARDS_FROZEN_ERROR });
        return;
      }
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
        format: b.format === "card" ? "card" as const : "narrated" as const,
        status: "queued",
        createdAt: Date.now(),
      };
      await repo.createTopic(topic);
    } else {
      res.status(400).json({ error: "provide topic_id or an inline topic" });
      return;
    }

    if (topic.format === "card" && cardsFrozen) {
      // Also covers pre-freeze card topics resubmitted by topic_id.
      res.status(403).json({ error: CARDS_FROZEN_ERROR });
      return;
    }
    const video = await createDraftVideo(repo, topic.id, topic.format ?? "narrated");
    const job = queue.enqueue("generate", { videoId: video.id });
    res.status(202).json({ video_id: video.id, job_id: job.id, status: video.status });
  });

  // --- Faceless founder journals -------------------------------------------

  // Founder-led in point of view, not camera presence. This produces a
  // persisted edit kit only; it deliberately cannot call voice/render clients.
  r.post("/founder-videos/kit", async (req, res) => {
    try {
      const input = normalizeFounderVideoInput(req.body ?? {});
      const generated = await generateFounderVideoKit(llm, input);
      const kitId = makeId("fkit");
      const generationId = makeId("gen");
      await repo.addGeneration({
        id: generationId,
        videoId: kitId,
        kind: "package",
        promptVersion: generated.promptVersion,
        model: generated.modelUsed,
        input: generated.input,
        output: generated.rawOutput,
        createdAt: Date.now(),
      });
      res.status(201).json({
        kit_id: kitId,
        prompt_version: generated.promptVersion,
        model: generated.modelUsed,
        kit: founderKitWire(generated.kit),
      });
    } catch (e) {
      if (e instanceof FounderKitValidationError) {
        res.status(400).json({ error: e.message, issues: e.issues });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      if (/429|insufficient_quota|exceeded your current quota/i.test(message)) {
        res.status(503).json({
          error: "founder kit generation is temporarily unavailable: OpenAI quota is exhausted; restore quota and retry this same request",
        });
        return;
      }
      if (/timeout|aborted/i.test(message)) {
        res.status(504).json({
          error: "founder kit generation timed out before a valid strict-schema response was returned; no usable kit was persisted",
        });
        return;
      }
      throw e;
    }
  });

  r.get("/founder-videos/kits", async (_req, res) => {
    const records = (await repo.listGenerations())
      .filter((record) => record.promptVersion === FOUNDER_KIT_PROMPT_VERSION)
      .sort((a, b) => b.createdAt - a.createdAt);
    const kits = records.flatMap((record) => {
      try {
        if (validateRawFounderKit(record.output).length) return [];
        return [{
          kit_id: record.videoId,
          prompt_version: record.promptVersion,
          model: record.model,
          created_at: record.createdAt,
          kit: founderKitWire(founderKitFromRaw(record.output)),
        }];
      } catch {
        return [];
      }
    });
    res.json({ kits });
  });

  // --- Caption contract (Rule 55.1 verifier) --------------------------------

  // Deterministic word-for-word verification of a caption plan against the
  // locked narration. Always 200 with a verdict — a FAIL verdict is a
  // successful verification, and every failure carries its reason and rule.
  r.post("/captions/validate", (req, res) => {
    const b = req.body ?? {};
    if (typeof b.script !== "string" || !b.script.trim()) {
      res.status(400).json({ error: "script (string) is required — the locked narration's exact words" });
      return;
    }
    let cards;
    if (Array.isArray(b.cards)) {
      cards = b.cards.map((c: { lines?: unknown }) => ({
        lines: Array.isArray(c?.lines) ? c.lines.map((l: unknown) => String(l)) : [],
      }));
    } else if (typeof b.plan_text === "string" && b.plan_text.trim()) {
      cards = parsePlanText(b.plan_text);
    } else {
      res.status(400).json({
        error: "provide cards (array of {lines}) or plan_text (one card per line, ' / ' between a card's two lines)",
      });
      return;
    }
    res.json(checkCaptionPlan(b.script, cards));
  });

  // LLM-assisted grouping of the locked narration into compliant cards. The
  // model only chooses break points; the deterministic verifier re-checks the
  // result, and a non-compliant result returns 422 with the exact failures —
  // never a silently degraded plan.
  r.post("/captions/plan", async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.script !== "string" || !b.script.trim()) {
      res.status(400).json({ error: "script (string) is required — the locked narration's exact words" });
      return;
    }
    try {
      const generated = await generateCaptionPlan(llm, b.script);
      // Hard rule (CLAUDE.md): the exact response model is recorded per
      // generation — caption plans are generations like any other.
      const planId = makeId("cplan");
      await repo.addGeneration({
        id: makeId("gen"),
        videoId: planId,
        kind: "package",
        promptVersion: CAPTION_PLAN_PROMPT_VERSION,
        model: generated.modelUsed,
        input: { script: b.script },
        output: { cards: generated.cards, verdict: generated.report.verdict },
        createdAt: Date.now(),
      });
      res.status(201).json({
        plan_id: planId,
        prompt_version: CAPTION_PLAN_PROMPT_VERSION,
        plan_text: planToText(generated.cards),
        cards: generated.cards,
        report: generated.report,
        model: generated.modelUsed,
        attempts: generated.attempts,
      });
    } catch (e) {
      if (e instanceof CaptionPlanError) {
        res.status(422).json({ error: e.message, issues: e.issues });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      if (/429|insufficient_quota|exceeded your current quota/i.test(message)) {
        res.status(503).json({
          error: "caption plan generation is temporarily unavailable: OpenAI quota is exhausted; restore quota and retry this same request",
        });
        return;
      }
      if (/401|invalid_api_key|incorrect api key/i.test(message)) {
        res.status(503).json({
          error: "caption plan generation failed: the OpenAI API key was rejected (401 invalid_api_key) — fix OPENAI_API_KEY in .env and restart the server",
        });
        return;
      }
      if (/timeout|aborted/i.test(message)) {
        res.status(504).json({
          error: "caption plan generation timed out before a valid strict-schema response was returned; nothing was persisted",
        });
        return;
      }
      throw e;
    }
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
    if (video.format === "card" && cardsFrozen) {
      // The freeze guards EVERY pipeline entry point, not just topic creation.
      res.status(403).json({ error: CARDS_FROZEN_ERROR });
      return;
    }
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

  // Surgical revision branch: use the current package + persisted judge
  // feedback as the base, then re-run fact-check, judge, voice, and render.
  // The prior package remains in generation history for comparison/rollback.
  r.post("/videos/:id/fix-feedback", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    if (video.format === "card" && cardsFrozen) {
      res.status(403).json({ error: CARDS_FROZEN_ERROR });
      return;
    }
    if (!video.pkg || !video.judge || (!video.judge.problems.length && !video.judge.fix.trim())) {
      res.status(409).json({ error: "video has no saved package with actionable judge feedback" });
      return;
    }
    if (!["ready_for_review", "needs_revision", "rejected"].includes(video.status)) {
      res.status(409).json({ error: `cannot revise feedback in status ${video.status}` });
      return;
    }
    try {
      if (video.status !== "needs_revision") transition(video, "needs_revision");
    } catch (e) {
      if (e instanceof TransitionError) { res.status(409).json({ error: e.message }); return; }
      throw e;
    }
    video.judge.pass = false; // makes the pipeline consume this feedback branch
    video.reviewNote = `targeted revision from judge feedback: ${video.judge.fix}`.slice(0, 1000);
    await repo.updateVideo(video);
    const job = queue.enqueue("generate", { videoId: video.id });
    res.status(202).json({
      video_id: video.id,
      job_id: job.id,
      status: video.status,
      mode: "targeted_revision",
      preserved_generation_count: video.generationIds.length,
    });
  });

  // Manual edit: the human outranks the judge. Edits are re-judged for the
  // record and re-rendered (the avatar has to speak the new script), then the
  // video returns to ready_for_review.
  r.post("/videos/:id/edit", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    if (video.format === "card" && cardsFrozen) {
      // Manual edit re-renders — that's card generation spend, so it's frozen too.
      res.status(403).json({ error: CARDS_FROZEN_ERROR });
      return;
    }
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
    // Human-authored content is not a rule cohort — keeping the generator-rule
    // ids would credit/blame those rules for a package they didn't shape.
    video.appliedRuleIds = undefined;
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

  // Retry just the Captions.ai step (burn captions, cut fillers/silences)
  // against the existing HeyGen render — no regeneration, no re-render.
  r.post("/videos/:id/postprocess", async (req, res) => {
    const video = await repo.getVideo(req.params.id);
    if (!video) { res.status(404).json({ error: "video not found" }); return; }
    if (!video.render.videoUrl) {
      res.status(409).json({ error: "no completed render to post-process" });
      return;
    }
    const job = queue.enqueue("postprocess", { videoId: video.id });
    res.status(202).json({ video_id: video.id, job_id: job.id });
  });

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
      if (typeof b[k] !== "number" || !Number.isFinite(b[k])) {
        res.status(400).json({ error: `${k} (number) is required` });
        return;
      }
    }
    if (b.skip_rate != null && (typeof b.skip_rate !== "number" || !Number.isFinite(b.skip_rate))) {
      res.status(400).json({ error: "skip_rate must be a number when provided" });
      return;
    }
    // Same canonicalizer as pasted ingestion: "instagram"/"facebook" map to
    // platform reels (NOT the tiktok fallback) with the surface derived below.
    const platform = canonicalPlatform(
      b.platform != null ? String(b.platform) : null,
      (video.pkg?.targetPlatform ?? "tiktok") as Platform,
    );
    // IG and FB share platform "reels" — surface keeps their streams apart.
    // The raw platform label is the fallback hint ("instagram" ⇒ surface).
    const surface = canonicalSurface(b.surface) ?? canonicalSurface(b.platform);
    if (platform === "reels" && !surface) {
      res.status(400).json({
        error:
          "reels metrics need an explicit surface (instagram or facebook) — " +
          "combined IG+FB totals never enter learning; send one request per surface",
      });
      return;
    }
    await repo.addMetrics({
      id: makeId("met"),
      videoId: video.id,
      platform,
      surface,
      reach: b.reach != null && Number.isFinite(Number(b.reach)) ? num(b.reach) : undefined,
      provenance: "real",
      views: num(b.views),
      avgWatchTime: num(b.avg_watch_time),
      completionRate: Math.max(0, Math.min(1, num(b.completion_rate))),
      skipRate: b.skip_rate != null ? Math.max(0, Math.min(1, num(b.skip_rate))) : undefined,
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

  // THE improvement entry point: paste raw analytics in any shape (platform UI
  // text, CSV, transcribed screenshots). The LLM parses it, entries are matched
  // to published videos (id > hook > title similarity) and stored. Follow with
  // POST /learning/run to convert the new data into better generation rules.
  r.post("/performance/ingest", async (req, res) => {
    const raw = req.body?.raw;
    if (typeof raw !== "string" || !raw.trim()) {
      res.status(400).json({ error: "raw (string) is required — paste the analytics text" });
      return;
    }
    // Always 200: the report itself says what matched — a zero-match paste is
    // feedback for the operator (reasons per entry), not a server error.
    const report = await ingestRawAnalytics(repo, llm, raw.trim());
    res.json(report);
  });

  // Latest metrics + engagement per video (dashboard performance view).
  r.get("/performance/summary", async (_req, res) => {
    const latest = await latestMetricsByVideo(repo);
    const videos = await repo.listVideos();
    // One row per (video, platform) stream — cross-posts show separately.
    const rows = videos
      .filter((v) => latest.has(v.id))
      .flatMap((v) =>
        latest.get(v.id)!.map((m) => ({
          video_id: v.id,
          hook: v.pkg?.selectedHook ?? null,
          platform: m.platform,
          views: m.views,
          completion_rate: m.completionRate,
          skip_rate: m.skipRate ?? null,
          avg_watch_time: m.avgWatchTime,
          likes: m.likes,
          shares: m.shares,
          saves: m.saves,
          engagement_score: Math.round(engagementScore(m) * 10) / 10,
          ingested_at: m.ingestedAt,
        })),
      )
      .sort((a, b) => b.engagement_score - a.engagement_score);
    res.json({ videos: rows });
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

  // Manual rule promotion — the human end of the evidence discipline: a
  // validated pattern/lesson becomes a live generator (or judge-calibration)
  // rule. Manual rules persist across learning runs (only learning_run rules
  // get superseded).
  r.post("/learning/rules", async (req, res) => {
    const b = req.body ?? {};
    const categories = ["hook", "caption", "topic", "structure", "tone", "length", "calibration"];
    if (!categories.includes(b.category)) {
      res.status(400).json({ error: `category must be one of ${categories.join(" | ")}` });
      return;
    }
    if (typeof b.rule !== "string" || b.rule.trim().length < 10) {
      res.status(400).json({ error: "rule (string, >=10 chars) is required" });
      return;
    }
    const rule: LearningRule = {
      id: makeId("rule"),
      category: b.category as LearningRule["category"],
      rule: b.rule.trim(),
      source: "manual",
      active: true,
      createdAt: Date.now(),
    };
    await repo.addRule(rule);
    res.status(201).json(rule);
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
      voice: deps.voice.provider,
      post: deps.post.provider,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProductionArtifact(raw: unknown): ProductionGateArtifact[] {
  if (!isPlainObject(raw)) return [];
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const kind = String(raw.kind ?? "") as ProductionGateArtifact["kind"];
  if (!label || !safeProductionArtifactUrl(url) || !["audio", "video", "file"].includes(kind)) {
    return [];
  }
  return [{ label, url, kind }];
}

function safeProductionArtifactUrl(url: string): boolean {
  if (url.startsWith("/production-artifacts/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function decideProductionGate(
  repo: Repo,
  id: string,
  decision: Exclude<ProductionGateStatus, "pending">,
  rawNote: unknown,
  res: any,
): Promise<void> {
  const gate = await repo.getProductionGate(id);
  if (!gate) { res.status(404).json({ error: "production gate not found" }); return; }
  if (gate.status !== "pending") {
    if (gate.status === decision) {
      res.json(productionGateWire(gate));
      return;
    }
    res.status(409).json({ error: `production gate is already ${gate.status}` });
    return;
  }
  gate.status = decision;
  gate.decidedAt = Date.now();
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note) gate.decisionNote = note.slice(0, 1000);
  await repo.updateProductionGate(gate);
  res.json(productionGateWire(gate));
}

function productionGateWire(g: ProductionGate) {
  return {
    id: g.id,
    key: g.key,
    production_id: g.productionId,
    stage: g.stage,
    title: g.title,
    summary: g.summary,
    artifacts: g.artifacts,
    status: g.status,
    requested_at: g.requestedAt,
    decided_at: g.decidedAt ?? null,
    decision_note: g.decisionNote ?? null,
    payload: g.payload ?? null,
  };
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
    source_ref: t.sourceRef ?? null, format: t.format ?? "narrated", status: t.status, created_at: t.createdAt,
  };
}

function videoWire(v: Video) {
  return {
    id: v.id,
    topic_id: v.topicId ?? null,
    format: v.format ?? "narrated",
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
    audio: v.audio
      ? {
          provider: v.audio.provider,
          status: v.audio.status,
          voice_id: v.audio.voiceId ?? null,
          error: v.audio.error ?? null,
        }
      : null,
    post: v.post
      ? {
          provider: v.post.provider,
          status: v.post.status,
          video_url: v.post.videoUrl ?? null,
          operations: v.post.operations ?? null,
          error: v.post.error ?? null,
        }
      : null,
    // The URL to actually publish: captioned+cleaned if available, else raw render.
    final_video_url: v.post?.videoUrl ?? v.render.videoUrl ?? null,
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
