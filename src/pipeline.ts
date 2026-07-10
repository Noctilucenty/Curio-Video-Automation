// The full automation loop for one video:
//   generate package -> judge -> (fail? rewrite with judge feedback, max 2 regens)
//   -> render on HeyGen -> ready_for_review.
// Every LLM call is recorded (prompt version, model, input, output) for A/B
// analysis and future fine-tune data. Humans approve/publish; nothing auto-posts.

import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { Renderer } from "./heygen.js";
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
  avatarId: string;
  voiceId: string;
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

  const activeRules = await repo.listRules(true);
  let feedback: JudgeScores | undefined = video.judge?.pass === false ? video.judge : undefined;

  // 1 fresh attempt + up to MAX_AUTO_REGENS rewrites fed with judge feedback.
  for (let attempt = 0; attempt <= MAX_AUTO_REGENS; attempt++) {
    video.attempts += 1;
    try {
      const gen = await generatePackage(llm, topic, activeRules, feedback);
      video.pkg = gen.pkg;
      await recordGeneration(repo, video, "package", gen.promptVersion, llm.model, gen.input, gen.rawOutput);
      setStatus(video, "generated");
      await repo.updateVideo(video);
    } catch (e) {
      // Generation/validation blew up — mark failed, keep the error visible.
      video.error = e instanceof Error ? e.message : String(e);
      setStatus(video, "failed");
      return repo.updateVideo(video);
    }

    const judged = await judgePackage(llm, video.pkg!);
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
  const judged = await judgePackage(llm, video.pkg);
  video.judge = judged.scores;
  await recordGeneration(repo, video, "judge", judged.promptVersion, llm.model, judged.input, judged.rawOutput);
  await repo.updateVideo(video);
  return renderVideo(deps, video);
}

/** Render the approved-quality package on HeyGen (or the mock renderer). */
async function renderVideo(deps: PipelineDeps, video: Video): Promise<Video> {
  const { repo, renderer } = deps;
  video.render = { provider: renderer.provider, status: "rendering" };
  await repo.updateVideo(video);
  try {
    const { providerVideoId } = await renderer.createVideo({
      pkg: video.pkg!,
      avatarId: deps.avatarId,
      voiceId: deps.voiceId,
    });
    video.render.providerVideoId = providerVideoId;
    await repo.updateVideo(video);

    const done = await renderer.pollUntilDone(providerVideoId);
    if (done.status === "completed") {
      video.render.status = "completed";
      video.render.videoUrl = done.videoUrl;
      setStatus(video, "ready_for_review");
    } else {
      video.render.status = "failed";
      video.render.error = done.error;
      video.error = `render failed: ${done.error}`;
      setStatus(video, "failed");
    }
  } catch (e) {
    video.render.status = "failed";
    video.render.error = e instanceof Error ? e.message : String(e);
    video.error = `render failed: ${video.render.error}`;
    setStatus(video, "failed");
  }
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
