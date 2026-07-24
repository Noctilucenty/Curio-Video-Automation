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
          "match_hint", "platform", "surface", "views", "reach", "avg_watch_time",
          "completion_rate", "skip_rate", "three_second_views", "likes", "comments",
          "shares", "saves", "follows", "profile_clicks", "app_downloads", "posted_at",
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
          surface: { type: ["string", "null"] },
          views: { type: "number" },
          reach: { type: ["number", "null"] },
          avg_watch_time: { type: ["number", "null"] },
          completion_rate: { type: ["number", "null"] },
          skip_rate: { type: ["number", "null"] },
          three_second_views: { type: ["number", "null"] },
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
  /** Exact distribution surface when the paste distinguishes it ("Instagram
   * views", "Facebook reach"). IG and FB canonicalize to the same platform,
   * so this is what keeps their metric streams separate. */
  surface?: string | null;
  views?: number | null;
  reach?: number | null;
  avg_watch_time?: number | null;
  completion_rate?: number | null;
  skip_rate?: number | null;
  three_second_views?: number | null;
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

// Platform names as they appear in pasted analytics -> our canonical ids.
const PLATFORM_ALIASES: Record<string, Platform> = {
  tiktok: "tiktok", instagram: "reels", ig: "reels", reels: "reels", facebook: "reels",
  fb: "reels", meta: "reels", youtube: "shorts", yt: "shorts", shorts: "shorts",
};
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
  "he", "her", "his", "in", "is", "it", "its", "of", "on", "or", "she", "that",
  "the", "they", "this", "to", "was", "we", "were", "with", "you", "your",
]);

export async function ingestRawAnalytics(repo: Repo, llm: LlmClient, raw: string): Promise<IngestReport> {
  const system = ingestSystemPrompt();
  const user = `RAW ANALYTICS:\n${raw}`;
  const parsed: any = await llm.generateJson({
    system,
    user,
    schemaName: "curio_analytics_entries",
    schema: INGEST_SCHEMA as unknown as Record<string, unknown>,
    purpose: "ingest",
  });
  const entries: ParsedEntry[] = Array.isArray(parsed?.entries) ? parsed.entries : [];

  const videos = await repo.listVideos();
  const published = videos.filter((v) => v.status === "published" && v.pkg);
  const report: IngestReport = { matched: [], unmatched: [], promptVersion: PROMPT_VERSIONS.ingest };
  const ingestRunId = makeId("ing");
  await repo.addGeneration({
    id: makeId("gen"),
    videoId: ingestRunId,
    kind: "ingest",
    promptVersion: PROMPT_VERSIONS.ingest,
    model: llm.model,
    input: { system, user },
    output: parsed,
    createdAt: Date.now(),
  });

  if (entries.length === 0) {
    report.unmatched.push({ entry: { match_hint: {} }, reason: "no analytics entries parsed" });
    return report;
  }

  for (const entry of entries) {
    const found = matchVideo(entry, videos, published);
    if ("reason" in found) {
      report.unmatched.push({ entry, reason: found.reason });
      continue;
    }
    // Views are the reliability anchor: an entry without positive views is
    // either a hint-only line (schema/prompt default the counts to 0) or a
    // broken paste. Storing it would write an all-zero row that latest-wins
    // semantics let OVERRIDE real earlier metrics, and interaction rates
    // divided by max(views,1) would explode. Refuse instead of corrupting.
    if (!(Number(entry.views) > 0)) {
      report.unmatched.push({ entry, reason: "no views value found — refusing to store unreliable metrics" });
      continue;
    }
    const { video, how } = found;
    const m = toMetrics(entry, video);
    // Meta gate: a reels row without an explicit surface is (or may be) a
    // combined IG+FB total — never a valid optimization target. Refusing with
    // a reason teaches the operator to pull the per-surface split instead of
    // silently creating an "unspecified" learning stream.
    if (m.platform === "reels" && !m.surface) {
      report.unmatched.push({
        entry,
        reason:
          "reels metrics need an explicit surface (instagram or facebook) — " +
          "combined IG+FB totals never enter learning; pull the per-surface split from Meta insights",
      });
      continue;
    }
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
  let idMissReason: string | null = null;
  if (hint.video_id) {
    const v = all.find((x) => x.id === hint.video_id);
    if (v?.status === "published" && v.pkg) return { video: v, how: "id" };
    idMissReason = v
      ? v.status === "published" ? `video ${v.id} has no package to match` : `video ${v.id} is ${v.status}, not published`
      : `no video with id ${hint.video_id}`;
  }
  for (const [key, how] of [["hook", "hook"], ["title", "title"]] as const) {
    const text = hint[key];
    if (!text) continue;
    // Exact-equality short-circuit: a paste that is character-identical (after
    // normalization) to exactly ONE stored hook/title is that video — the
    // ambiguity margin below must not veto it just because a near-duplicate
    // sibling (learning converges hooks onto shared formulas) scores 0.9.
    const nt = normalize(text);
    const exact = published.filter(
      (v) => normalize(key === "hook" ? v.pkg!.selectedHook : v.pkg!.title) === nt,
    );
    if (exact.length === 1) return { video: exact[0], how };

    const scored = published
      .map((v) => ({
        v,
        score: similarity(text, key === "hook" ? v.pkg!.selectedHook : v.pkg!.title),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];
    // Require a clear winner: good absolute score AND a margin over #2, so one
    // pasted hook can't silently attach metrics to the wrong video.
    if (best && best.score >= 0.5 && (!runnerUp || best.score - runnerUp.score >= 0.15 || runnerUp.score < 0.5)) {
      return { video: best.v, how };
    }
    if (best && runnerUp && best.score >= 0.5 && runnerUp.score >= 0.5) {
      return { reason: ambiguousReason(how, text, scored.slice(0, 3)) };
    }
  }
  const desc = hint.hook ?? hint.title ?? JSON.stringify(hint);
  const fallbackReason = `no published video matches "${String(desc).slice(0, 80)}"`;
  return { reason: idMissReason ? `${idMissReason}; ${fallbackReason}` : fallbackReason };
}

/** Token-set similarity with containment shortcut; input already messy, so cheap+robust. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = meaningfulTokens(na);
  const tb = meaningfulTokens(nb);
  if (ta.length < 2 || tb.length < 2) return 0;
  if (containsTokenSet(ta, tb) || containsTokenSet(tb, ta)) return 0.9;
  const tsa = new Set(ta);
  const tsb = new Set(tb);
  let inter = 0;
  for (const t of tsa) if (tsb.has(t)) inter++;
  return inter / (tsa.size + tsb.size - inter);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function meaningfulTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function containsTokenSet(a: string[], b: string[]): boolean {
  const small = a.length <= b.length ? a : b;
  const large = new Set(a.length <= b.length ? b : a);
  return small.length >= 2 && small.every((t) => large.has(t));
}

function ambiguousReason(
  how: "hook" | "title",
  text: string,
  scored: Array<{ v: Video; score: number }>,
): string {
  const candidates = scored
    .map(({ v, score }) => `${v.id} "${how === "hook" ? v.pkg?.selectedHook : v.pkg?.title}" (${score.toFixed(2)})`)
    .join("; ");
  return `ambiguous ${how} match for "${String(text).slice(0, 80)}": ${candidates}`;
}

function toMetrics(entry: ParsedEntry, video: Video): PerformanceMetrics {
  const platform = canonicalPlatform(entry.platform, video.pkg?.targetPlatform ?? "tiktok");
  return {
    id: makeId("met"),
    videoId: video.id,
    platform,
    // The platform label doubles as a surface hint: "Instagram" and "Facebook"
    // both canonicalize to platform "reels", but their streams must never merge.
    surface: canonicalSurface(entry.surface) ?? canonicalSurface(entry.platform),
    reach: entry.reach != null ? num(entry.reach) : undefined,
    provenance: "real", // pasted platform analytics — the loop's only training signal
    views: num(entry.views),
    // Unknown stays null — storing 0 for "not reported" corrupted the
    // 2026-07-23 learning stream (zero completion beside 12s avg watch).
    avgWatchTime: entry.avg_watch_time != null ? num(entry.avg_watch_time) : null,
    completionRate: entry.completion_rate != null ? rate(entry.completion_rate) : null,
    skipRate: entry.skip_rate != null ? rate(entry.skip_rate) : undefined,
    threeSecondViews: entry.three_second_views != null ? num(entry.three_second_views) : null,
    likes: num(entry.likes),
    comments: num(entry.comments),
    shares: num(entry.shares),
    saves: num(entry.saves),
    follows: num(entry.follows),
    profileClicks: num(entry.profile_clicks),
    appDownloads: entry.app_downloads != null ? num(entry.app_downloads) : undefined,
    postedAt: epochMs(entry.posted_at) ?? video.publishedAt ?? Date.now(),
    ingestedAt: Date.now(),
  };
}

/** Accept epoch seconds or milliseconds; anything before ~2001 in ms terms is seconds. */
function epochMs(v: number | null | undefined): number | null {
  if (!v || !Number.isFinite(v) || v <= 0) return null;
  return v < 1e12 ? Math.round(v * 1000) : v;
}

/**
 * Map a free-form label ("Instagram", "FB", "ig reels") to the exact
 * distribution surface, or undefined when the label doesn't identify one
 * (e.g. bare "reels" — could be either IG or FB). Shared with the direct
 * /videos/:id/performance route so every live ingestion path separates
 * surfaces the same way.
 */
export function canonicalSurface(
  label: string | null | undefined,
): PerformanceMetrics["surface"] {
  if (!label) return undefined;
  const tokens = new Set(normalize(label).split(" "));
  if (tokens.has("instagram") || tokens.has("ig")) return "instagram";
  if (tokens.has("facebook") || tokens.has("fb") || tokens.has("meta")) return "facebook";
  if (tokens.has("tiktok") || tokens.has("tik") || tokens.has("tok")) return "tiktok";
  if (tokens.has("youtube") || tokens.has("yt") || tokens.has("shorts")) return "youtube";
  return undefined;
}

/** Map a free-form platform label ("Instagram", "FB", "TikTok Studio") to the
 * canonical platform id. Shared with the direct performance route so
 * "instagram" is never misfiled under the tiktok fallback. */
export function canonicalPlatform(label: string | null | undefined, fallback: Platform): Platform {
  const normalized = label ? normalize(label) : "";
  if (!normalized) return fallback;
  const direct = PLATFORM_ALIASES[normalized];
  if (direct) return direct;
  const tokens = new Set(normalized.split(" "));
  if (tokens.has("tiktok") || tokens.has("tik") || tokens.has("tok")) return "tiktok";
  if (tokens.has("instagram") || tokens.has("ig") || tokens.has("reels") || tokens.has("facebook") || tokens.has("fb") || tokens.has("meta")) {
    return "reels";
  }
  if (tokens.has("youtube") || tokens.has("yt") || tokens.has("shorts")) return "shorts";
  return fallback;
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
