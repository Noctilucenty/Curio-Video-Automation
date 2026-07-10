// Frictionless analytics ingestion: paste raw platform analytics in ANY format
// (TikTok/IG/YouTube UI text, CSV, transcribed screenshots, notes) and the LLM
// parses it into per-video metrics. Entries are matched to published videos by
// id, then fuzzy hook/title similarity. Matched metrics land in the repo (latest
// row per video wins), ready for the next learning run — this is the "send me
// the analytics and it improves" entry point.

import type { Repo } from "./repository.js";
import type { LlmClient } from "./llm.js";
import type { PerformanceMetrics, Platform, Video } from "./types.js";
import { ingestSystemPrompt, PROMPT_VERSIONS } from "./prompts.js";
import { makeId } from "./config.js";

// OpenAI strict structured-output mode requires EVERY property to appear in
// `required` — absent values are modeled as null, and the parsing code treats
// null as "not present".
export const INGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "match_hint", "platform", "views", "avg_watch_time", "completion_rate",
          "skip_rate", "likes", "comments", "shares", "saves", "follows",
          "profile_clicks", "app_downloads", "posted_at",
        ],
        properties: {
          match_hint: {
            type: "object",
            additionalProperties: false,
            required: ["video_id", "hook", "title"],
            properties: {
              video_id: { type: ["string", "null"] },
              hook: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
            },
          },
          platform: { type: ["string", "null"] },
          views: { type: "number" },
          avg_watch_time: { type: ["number", "null"] },
          completion_rate: { type: ["number", "null"] },
          skip_rate: { type: ["number", "null"] },
          likes: { type: "number" },
          comments: { type: "number" },
          shares: { type: "number" },
          saves: { type: "number" },
          follows: { type: ["number", "null"] },
          profile_clicks: { type: ["number", "null"] },
          app_downloads: { type: ["number", "null"] },
          posted_at: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;

export interface ParsedEntry {
  match_hint: { video_id?: string | null; hook?: string | null; title?: string | null };
  platform?: string | null;
  views?: number | null;
  avg_watch_time?: number | null;
  completion_rate?: number | null;
  skip_rate?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  follows?: number | null;
  profile_clicks?: number | null;
  app_downloads?: number | null;
  posted_at?: number | null;
}

export interface IngestReport {
  matched: Array<{ video_id: string; hook: string; metrics_id: string; match: "id" | "hook" | "title" }>;
  unmatched: Array<{ entry: ParsedEntry; reason: string }>;
  promptVersion: string;
}

const PLATFORMS = new Set<Platform>(["tiktok", "reels", "shorts"]);
// Platform names as they appear in pasted analytics -> our canonical ids.
const PLATFORM_ALIASES: Record<string, Platform> = {
  tiktok: "tiktok", instagram: "reels", ig: "reels", reels: "reels", facebook: "reels",
  youtube: "shorts", yt: "shorts", shorts: "shorts",
};

export async function ingestRawAnalytics(repo: Repo, llm: LlmClient, raw: string): Promise<IngestReport> {
  const parsed: any = await llm.generateJson({
    system: ingestSystemPrompt(),
    user: `RAW ANALYTICS:\n${raw}`,
    schemaName: "curio_analytics_entries",
    schema: INGEST_SCHEMA as unknown as Record<string, unknown>,
    purpose: "ingest",
  });
  const entries: ParsedEntry[] = Array.isArray(parsed?.entries) ? parsed.entries : [];

  const videos = await repo.listVideos();
  const published = videos.filter((v) => v.status === "published" && v.pkg);
  const report: IngestReport = { matched: [], unmatched: [], promptVersion: PROMPT_VERSIONS.ingest };

  for (const entry of entries) {
    const found = matchVideo(entry, videos, published);
    if ("reason" in found) {
      report.unmatched.push({ entry, reason: found.reason });
      continue;
    }
    const { video, how } = found;
    const m = toMetrics(entry, video);
    await repo.addMetrics(m);
    report.matched.push({
      video_id: video.id,
      hook: video.pkg?.selectedHook ?? "",
      metrics_id: m.id,
      match: how,
    });
  }
  return report;
}

function matchVideo(
  entry: ParsedEntry,
  all: Video[],
  published: Video[],
): { video: Video; how: "id" | "hook" | "title" } | { reason: string } {
  const hint = entry.match_hint ?? {};
  if (hint.video_id) {
    const v = all.find((x) => x.id === hint.video_id);
    if (!v) return { reason: `no video with id ${hint.video_id}` };
    if (v.status !== "published") return { reason: `video ${v.id} is ${v.status}, not published` };
    return { video: v, how: "id" };
  }
  for (const [key, how] of [["hook", "hook"], ["title", "title"]] as const) {
    const text = hint[key];
    if (!text) continue;
    const scored = published
      .map((v) => ({
        v,
        score: similarity(text, key === "hook" ? v.pkg!.selectedHook : v.pkg!.title),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    // Require a clear winner: good absolute score AND a margin over #2, so one
    // pasted hook can't silently attach metrics to the wrong video.
    if (best && best.score >= 0.5 && (scored.length < 2 || best.score - scored[1].score >= 0.15 || scored[1].score < 0.5)) {
      return { video: best.v, how };
    }
  }
  const desc = hint.hook ?? hint.title ?? JSON.stringify(hint);
  return { reason: `no published video matches "${String(desc).slice(0, 80)}"` };
}

/** Token-set similarity with containment shortcut; input already messy, so cheap+robust. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function toMetrics(entry: ParsedEntry, video: Video): PerformanceMetrics {
  const alias = entry.platform ? PLATFORM_ALIASES[entry.platform.toLowerCase().trim()] : undefined;
  const platform: Platform =
    alias ?? (PLATFORMS.has(entry.platform as Platform) ? (entry.platform as Platform)
      : video.pkg?.targetPlatform ?? "tiktok");
  return {
    id: makeId("met"),
    videoId: video.id,
    platform,
    views: num(entry.views),
    avgWatchTime: num(entry.avg_watch_time),
    completionRate: rate(entry.completion_rate),
    skipRate: entry.skip_rate != null ? rate(entry.skip_rate) : undefined,
    likes: num(entry.likes),
    comments: num(entry.comments),
    shares: num(entry.shares),
    saves: num(entry.saves),
    follows: num(entry.follows),
    profileClicks: num(entry.profile_clicks),
    appDownloads: entry.app_downloads != null ? num(entry.app_downloads) : undefined,
    postedAt: entry.posted_at && Number.isFinite(entry.posted_at) ? entry.posted_at : video.publishedAt ?? Date.now(),
    ingestedAt: Date.now(),
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Accept 0-1 or 0-100 ("42%" parsed as 42) — normalize to 0-1. */
function rate(v: unknown): number {
  let n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) n = n / 100;
  return Math.min(1, n);
}
