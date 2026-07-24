// Automated platform-separated analytics capture via the Meta Graph API.
//
// Replaces the manual Business Suite browsing round-trips (2026-07-23 batch
// took ~30 of them). Pulls FB Reel + IG Reel insights for every experiment in
// data/posted-experiments.json, matches by caption prefix, APPENDS a
// checkpoint per experiment (never overwrites prior checkpoints — they are
// time-series evidence), and writes a dated sidecar capture file.
//
// It deliberately does NOT rewrite top-level analytics or run the importer:
// updating the "latest" picture stays a reviewed action (doctrine: record
// observations before explaining them). After a capture, update analytics +
// run `npx tsx tools/import_posted_experiments.ts` + re-ingest FB rows.
//
// Integrity rules (2026-07-23 lessons, enforced here):
// - A metric the API does not return is ABSENT/null — never 0.
// - IG and FB are separate objects; no combined totals are computed.
//
// Run from the repo root with the env loaded:
//   set -a && source .env && set +a
//   npx tsx tools/capture_meta_insights.ts --check     # token/permission probe
//   npx tsx tools/capture_meta_insights.ts             # capture all experiments
//
// Requires META_ACCESS_TOKEN (a User token that can list the Page, or a Page
// token). When expired, --check says so and nothing is written.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN ?? "";
const DATASET = resolve(process.argv.includes("--dataset")
  ? process.argv[process.argv.indexOf("--dataset") + 1]
  : "data/posted-experiments.json");
const CHECK_ONLY = process.argv.includes("--check");

interface GraphError { error?: { message: string; code: number; type?: string } }

async function g<T = any>(path: string, params: Record<string, string> = {}): Promise<T & GraphError> {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  return res.json() as Promise<T & GraphError>;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Insights values arrive as [{name, values:[{value}]}] — flatten defensively. */
function flattenInsights(data: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const v = row?.values?.[0]?.value;
    if (typeof v === "number") out[row.name] = v;
    else if (v && typeof v === "object") {
      // reaction-type breakdowns etc. — store the sum under the metric name
      const sum = Object.values(v).reduce((a: number, b) => a + (typeof b === "number" ? b : 0), 0);
      out[row.name] = sum;
    }
  }
  return out;
}

/** Fetch a metric list one-by-one so a single unsupported name cannot void the call. */
async function insightsTolerant(objectId: string, metrics: string[], extra: Record<string, string> = {}) {
  const combined = await g<{ data: any[] }>(`${objectId}/insights`, { metric: metrics.join(","), ...extra });
  if (!combined.error) return { values: flattenInsights(combined.data), errors: [] as string[] };
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const m of metrics) {
    const one = await g<{ data: any[] }>(`${objectId}/insights`, { metric: m, ...extra });
    if (one.error) errors.push(`${m}: ${one.error.message}`);
    else Object.assign(values, flattenInsights(one.data));
  }
  return { values, errors };
}

function captionKey(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

async function main() {
  if (!TOKEN) die("META_ACCESS_TOKEN is not set — add it to .env (source .env first).");

  const me = await g("me", { fields: "id,name" });
  if (me.error) {
    die(`Token check FAILED: ${me.error.message}\n` +
      "Renew it: https://developers.facebook.com/tools/explorer (User token with " +
      "pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights; " +
      "then extend to long-lived) and update META_ACCESS_TOKEN in .env.");
  }
  console.log(`token OK — acting as: ${me.name} (${me.id})`);

  const pages = await g<{ data: Array<{ id: string; name: string; access_token: string }> }>(
    "me/accounts", { fields: "id,name,access_token" });
  const page = pages.data?.find((p) => /curio/i.test(p.name)) ?? pages.data?.[0];
  if (!page) die("No Facebook Page visible to this token (need pages_show_list / pages_read_engagement).");
  console.log(`page: ${page.name} (${page.id})`);
  const pageToken = page.access_token;
  const gp = async <T = any>(path: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ ...params, access_token: pageToken });
    const res = await fetch(`${GRAPH}/${path}?${qs}`);
    return res.json() as Promise<T & GraphError>;
  };

  const igLink = await gp(`${page.id}`, { fields: "instagram_business_account{id,username}" });
  const igUser = igLink.instagram_business_account?.id ?? null;
  console.log(`instagram business account: ${igLink.instagram_business_account?.username ?? "NOT LINKED"}`);
  if (CHECK_ONLY) {
    console.log("--check passed: token valid, page + IG account reachable.");
    return;
  }

  const dataset = JSON.parse(readFileSync(DATASET, "utf8"));
  const byCaption = new Map<string, any>();
  for (const exp of dataset.experiments) {
    if (exp.postedCaptionText) byCaption.set(captionKey(exp.postedCaptionText), exp);
  }
  const capturedAt = new Date().toISOString().slice(0, 16);
  const sidecar: any = { capturedAt, source: "graph-api capture_meta_insights.ts", facebook: [], instagram: [], unmatched: [] };

  // ---- Facebook Reels on the Page --------------------------------------
  const reels = await gp<{ data: Array<{ id: string; description?: string; updated_time?: string }> }>(
    `${page.id}/video_reels`, { fields: "id,description,updated_time", limit: "25" });
  for (const reel of reels.data ?? []) {
    const exp = byCaption.get(captionKey(reel.description));
    const { values, errors } = await insightsTolerant(reel.id, [
      "blue_reels_play_count",
      "post_video_avg_time_watched",   // ms
      "post_video_view_time",          // ms
      "post_video_likes_by_reaction_type",
      "post_video_social_actions",
    ]);
    const row = {
      fb_video_id: reel.id,
      experiment: exp?.id ?? null,
      caption_head: (reel.description ?? "").slice(0, 60),
      metrics: values,
      metric_errors: errors,
    };
    sidecar.facebook.push(row);
    if (!exp) sidecar.unmatched.push({ surface: "facebook", id: reel.id, caption_head: row.caption_head });
  }

  // ---- Instagram Reels ---------------------------------------------------
  if (igUser) {
    const media = await gp<{ data: Array<{ id: string; caption?: string; media_product_type?: string; timestamp?: string }> }>(
      `${igUser}/media`, { fields: "id,caption,media_product_type,timestamp", limit: "25" });
    for (const m of media.data ?? []) {
      if (m.media_product_type && m.media_product_type !== "REELS") continue;
      const exp = byCaption.get(captionKey(m.caption));
      const { values, errors } = await insightsTolerant(m.id, [
        "views", "reach", "likes", "comments", "shares", "saved", "total_interactions",
        "ig_reels_avg_watch_time",        // ms
        "ig_reels_video_view_total_time", // ms
        "follows", "profile_visits",
      ]);
      const row = {
        ig_media_id: m.id,
        experiment: exp?.id ?? null,
        caption_head: (m.caption ?? "").slice(0, 60),
        metrics: values,
        metric_errors: errors,
      };
      sidecar.instagram.push(row);
      if (!exp) sidecar.unmatched.push({ surface: "instagram", id: m.id, caption_head: row.caption_head });
    }
  }

  // ---- Append per-experiment checkpoints (time-series evidence) ----------
  let appended = 0;
  for (const exp of dataset.experiments) {
    const fb = sidecar.facebook.find((r: any) => r.experiment === exp.id);
    const ig = sidecar.instagram.find((r: any) => r.experiment === exp.id);
    if (!fb && !ig) continue;
    exp.analytics.checkpoints = exp.analytics.checkpoints ?? [];
    exp.analytics.checkpoints.push({
      capturedAt,
      source: "graph-api",
      facebook: fb ? { ...fb.metrics, _errors: fb.metric_errors } : null,
      instagram: ig ? { ...ig.metrics, _errors: ig.metric_errors } : null,
      note: "automated capture — raw Graph metric names; absent metric = not returned, never 0",
    });
    appended++;
  }
  writeFileSync(DATASET, JSON.stringify(dataset, null, 2));
  const sidecarPath = resolve(`data/viral-intelligence/${capturedAt.slice(0, 10)}-graph-capture.json`);
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

  console.log(`\ncaptured ${sidecar.facebook.length} FB reels + ${sidecar.instagram.length} IG reels; ` +
    `${appended} experiment checkpoints appended; unmatched: ${sidecar.unmatched.length}`);
  console.log(`sidecar: ${sidecarPath}`);
  console.log("\nNEXT (reviewed steps, not automated): update top-level analytics from the new " +
    "checkpoint, run `npx tsx tools/import_posted_experiments.ts`, re-ingest FB rows, then a learning run.");
}

main().catch((e) => die(String(e?.stack ?? e)));
