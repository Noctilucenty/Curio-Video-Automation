// The full automation loop for one video:
//   generate package -> judge -> (fail? rewrite with judge feedback, max 2 regens)
//   -> ElevenLabs narration -> HeyGen render (lip-sync to that audio)
//   -> Captions.ai (burn captions, cut fillers + silences) -> ready_for_review.
// Every LLM call is recorded (prompt version, model, input, output) for A/B
// analysis and future fine-tune data. Humans approve/publish; nothing auto-posts.

import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { Renderer } from "./heygen.js";
import type { VoiceSynth } from "./voice.js";
import type { PostProcessor } from "./postprocess.js";
import type { JudgeScores, Topic, Video } from "./types.js";
import { assertTransition } from "./types.js";
import { generatePackage } from "./generator.js";
import { judgePackage } from "./judge.js";
import { makeId } from "./config.js";

export const MAX_AUTO_REGENS = 2;

export interface PipelineDeps {
  repo: Repo;
  llm: LlmClient;
  renderer: Renderer;
  voice: VoiceSynth;
  post: PostProcessor;
  avatarId: string;
  voiceId: string;
  language?: string;
}

export async function createDraftVideo(repo: Repo, topicId?: string): Promise<Video> {
  const now = Date.now();
  return repo.createVideo({
    id: makeId("vid"),
    topicId,
    status: "draft",
    attempts: 0,
    generationIds: [],
    render: { provider: "mock", status: "not_started" },
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Run generation for a video that is in `draft` or `needs_revision`.
 * Never throws for content-quality outcomes (those land as needs_revision);
 * throws only if the video/topic rows are missing (caller bug).
 */
export async function runGenerationPipeline(deps: PipelineDeps, videoId: string): Promise<Video> {
  const { repo, llm } = deps;
  const video = await repo.getVideo(videoId);
  if (!video) throw new Error(`video not found: ${videoId}`);
  const topic = video.topicId ? await repo.getTopic(video.topicId) : null;
  if (!topic) throw new Error(`video ${videoId} has no topic attached`);

  // Generator rules steer content; calibration rules correct the judge.
  const activeRules = await repo.listRules(true);
  const generatorRules = activeRules.filter((r) => r.category !== "calibration");
  const calibrationRules = activeRules.filter((r) => r.category === "calibration");
  let feedback: JudgeScores | undefined = video.judge?.pass === false ? video.judge : undefined;

  // 1 fresh attempt + up to MAX_AUTO_REGENS rewrites fed with judge feedback.
  for (let attempt = 0; attempt <= MAX_AUTO_REGENS; attempt++) {
    video.attempts += 1;
    try {
      const gen = await generatePackage(llm, topic, generatorRules, feedback);
      video.pkg = gen.pkg;
      // Cohort key for later rule validation: which rules shaped this package.
      video.appliedRuleIds = generatorRules.map((r) => r.id);
      await recordGeneration(repo, video, "package", gen.promptVersion, llm.model, gen.input, gen.rawOutput);
      setStatus(video, "generated");
      await repo.updateVideo(video);
    } catch (e) {
      // Generation/validation blew up — mark failed, keep the error visible.
      video.error = e instanceof Error ? e.message : String(e);
      setStatus(video, "failed");
      return repo.updateVideo(video);
    }

    const judged = await judgePackage(llm, video.pkg!, calibrationRules);
    video.judge = judged.scores;
    await recordGeneration(repo, video, "judge", judged.promptVersion, llm.model, judged.input, judged.rawOutput);

    if (judged.scores.pass) break;

    feedback = judged.scores;
    if (attempt < MAX_AUTO_REGENS) {
      setStatus(video, "needs_revision"); // transparent trail: generated -> needs_revision -> generated
      await repo.updateVideo(video);
    }
  }

  if (!video.judge?.pass) {
    // Exhausted the rewrite loop — park for a human instead of rendering junk.
    setStatus(video, "needs_revision");
    return repo.updateVideo(video);
  }

  await markTopicUsed(repo, topic);
  return renderVideo(deps, video);
}

/**
 * Post-manual-edit path: re-judge for the record (the human outranks the judge,
 * so a fail doesn't block), re-render the new script, back to ready_for_review.
 */
export async function finalizeManualEdit(deps: PipelineDeps, videoId: string): Promise<Video> {
  const { repo, llm } = deps;
  const video = await repo.getVideo(videoId);
  if (!video?.pkg) throw new Error(`video ${videoId} has no package to finalize`);
  const calibrationRules = (await repo.listRules(true)).filter((r) => r.category === "calibration");
  const judged = await judgePackage(llm, video.pkg, calibrationRules);
  video.judge = judged.scores;
  await recordGeneration(repo, video, "judge", judged.promptVersion, llm.model, judged.input, judged.rawOutput);
  await repo.updateVideo(video);
  return renderVideo(deps, video);
}

/**
 * Voice -> render -> post-process. ElevenLabs speaks the script (Zack-style
 * narration voice), HeyGen lip-syncs to that audio, Captions.ai burns the
 * curio_premium captions and cuts filler words + silences.
 */
async function renderVideo(deps: PipelineDeps, video: Video): Promise<Video> {
  const { repo, renderer, voice } = deps;
  // Fail fast with an actionable message instead of a cryptic provider error:
  // a live HeyGen renderer without an avatar can never produce a video.
  if (renderer.provider === "heygen" && !deps.avatarId) {
    video.render = {
      provider: renderer.provider,
      status: "failed",
      error: "HEYGEN_AVATAR_ID is not set — pick an avatar in HeyGen and add its id to .env",
    };
    video.error = video.render.error;
    setStatus(video, "failed");
    return repo.updateVideo(video);
  }
  video.render = { provider: renderer.provider, status: "rendering" };
  video.audio = { provider: voice.provider, status: "not_started" };
  await repo.updateVideo(video);
  try {
    // 1. Narration. A voice failure falls back to HeyGen TTS (visible on the
    //    video row) rather than killing the render — reviewer decides.
    let audioAssetId: string | undefined;
    try {
      const synth = await voice.synthesize(video.pkg!.script);
      const { assetId } = await renderer.uploadAudio(synth.audio, synth.mimeType);
      video.audio = { provider: voice.provider, status: "completed", voiceId: synth.voiceId, assetId };
      audioAssetId = assetId;
    } catch (e) {
      video.audio = {
        provider: voice.provider,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    await repo.updateVideo(video);

    // 2. Avatar render.
    const { providerVideoId } = await renderer.createVideo({
      pkg: video.pkg!,
      avatarId: deps.avatarId,
      voiceId: deps.voiceId,
      audioAssetId,
    });
    video.render.providerVideoId = providerVideoId;
    await repo.updateVideo(video);

    const done = await renderer.pollUntilDone(providerVideoId);
    if (done.status !== "completed") {
      video.render.status = "failed";
      video.render.error = done.error;
      video.error = `render failed: ${done.error}`;
      setStatus(video, "failed");
      return repo.updateVideo(video);
    }
    video.render.status = "completed";
    video.render.videoUrl = done.videoUrl;
    await repo.updateVideo(video);

    // 3. Captions + cleanup. A post failure leaves the raw render reviewable
    //    (status still ready_for_review) with the error visible; retry via
    //    POST /videos/:id/postprocess.
    await runPostProcess(deps, video);
    setStatus(video, "ready_for_review");
  } catch (e) {
    video.render.status = "failed";
    video.render.error = e instanceof Error ? e.message : String(e);
    video.error = `render failed: ${video.render.error}`;
    setStatus(video, "failed");
  }
  return repo.updateVideo(video);
}

/** Run (or re-run) the Captions.ai step against the completed render. */
export async function runPostProcess(deps: PipelineDeps, video: Video): Promise<Video> {
  const { repo, post } = deps;
  if (!video.pkg || !video.render.videoUrl) {
    throw new Error(`video ${video.id} has no completed render to post-process`);
  }
  video.post = { provider: post.provider, status: "processing" };
  await repo.updateVideo(video);
  const result = await post.process({
    videoUrl: video.render.videoUrl,
    captionLines: video.pkg.captionLines,
    language: deps.language ?? "en",
  });
  video.post = {
    provider: post.provider,
    status: result.status,
    videoUrl: result.videoUrl,
    operations: result.operations,
    error: result.error,
  };
  return repo.updateVideo(video);
}

function setStatus(video: Video, to: Video["status"]): void {
  assertTransition(video.status, to);
  video.status = to;
}

async function recordGeneration(
  repo: Repo,
  video: Video,
  kind: "package" | "judge",
  promptVersion: string,
  model: string,
  input: unknown,
  output: unknown,
): Promise<void> {
  const id = makeId("gen");
  video.generationIds.push(id);
  await repo.addGeneration({
    id, videoId: video.id, kind, promptVersion, model, input, output, createdAt: Date.now(),
  });
}

async function markTopicUsed(repo: Repo, topic: Topic): Promise<void> {
  if (topic.status !== "used") {
    topic.status = "used";
    await repo.updateTopic(topic);
  }
}
