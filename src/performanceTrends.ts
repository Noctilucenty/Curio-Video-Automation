import type { PerformanceMetrics, Video } from "./types.js";

const CHECKPOINT_HOURS = [2, 24, 72, 168] as const;

export interface PerformanceStreamAnalysis {
  video_id: string;
  label: string;
  platform: string;
  surface: string;
  posted_at: number;
  age_hours: number;
  latest: {
    views: number;
    completion_rate: number | null;
    skip_rate: number | null;
    avg_watch_time: number | null;
    scroll_stop_rate: number | null;
    advocacy_rate: number;
    conversion_rate: number;
    ingested_at: number;
  };
  delta_from_prior: {
    views: number;
    completion_points: number | null;
    skip_points: number | null;
    advocacy_actions: number;
  } | null;
  checkpoints: Array<{ hours: number; due: boolean; captured: boolean; captured_at: number | null }>;
  /** No verdict language before 72h — FB recommendation surges start 27-44h
   * post-publish (2026-07-23: Harrison sat at 4K views at hour 40, finished
   * at 77.7K). */
  verdict_eligible: boolean;
  weakest_gate: "scroll_stop" | "retention" | "advocacy" | "conversion" | "insufficient_data";
  recommendation: string;
}

export interface PerformanceTrendReport {
  generated_at: number;
  checkpoints: number[];
  streams: PerformanceStreamAnalysis[];
  missing_due: number;
}

/**
 * Deterministic longitudinal diagnosis. It never merges Instagram and
 * Facebook, never promotes a content rule, and never lets one snapshot become
 * a trend. The LLM learning run remains a separate, evidence-gated action.
 */
export function analyzePerformanceOverTime(
  videos: Video[],
  metrics: PerformanceMetrics[],
  now = Date.now(),
): PerformanceTrendReport {
  const byVideo = new Map(videos.map((video) => [video.id, video]));
  const grouped = new Map<string, PerformanceMetrics[]>();
  for (const metric of metrics.filter((m) => m.provenance !== "synthetic")) {
    const surface = metric.surface ?? metric.platform;
    const key = `${metric.videoId}::${metric.platform}::${surface}`;
    const rows = grouped.get(key) ?? [];
    rows.push(metric);
    grouped.set(key, rows);
  }

  const streams = [...grouped.values()].flatMap((rows) => {
    rows.sort((a, b) => a.ingestedAt - b.ingestedAt);
    const latest = rows.at(-1)!;
    const prior = rows.length > 1 ? rows.at(-2)! : null;
    const video = byVideo.get(latest.videoId);
    if (!video) return [];
    const postedAt = latest.postedAt || video.publishedAt || latest.ingestedAt;
    const ageHours = Math.max(0, (now - postedAt) / 3_600_000);
    const checkpoints = CHECKPOINT_HOURS.map((hours, index) => {
      const nextHours = CHECKPOINT_HOURS[index + 1] ?? Number.POSITIVE_INFINITY;
      // A late analytics paste cannot retroactively satisfy every earlier
      // checkpoint. Attribute each row only to the window it was captured in.
      const captured = rows.find((row) => {
        const capturedAge = (row.ingestedAt - postedAt) / 3_600_000;
        return capturedAge >= hours && capturedAge < nextHours;
      });
      return { hours, due: ageHours >= hours, captured: Boolean(captured), captured_at: captured?.ingestedAt ?? null };
    });
    const views = Math.max(latest.views, 1);
    const advocacyRate = (latest.shares + latest.saves) / views;
    const conversionRate = (latest.follows + latest.profileClicks) / views;
    const diagnosis = diagnose(latest, video, advocacyRate, conversionRate);
    return [{
      video_id: latest.videoId,
      label: video.pkg?.selectedHook ?? video.pkg?.title ?? latest.videoId,
      platform: latest.platform,
      surface: latest.surface ?? latest.platform,
      posted_at: postedAt,
      age_hours: Math.round(ageHours * 10) / 10,
      latest: {
        views: latest.views,
        completion_rate: latest.completionRate,
        skip_rate: latest.skipRate ?? null,
        avg_watch_time: latest.avgWatchTime,
        scroll_stop_rate: latest.threeSecondViews != null
          ? Math.round((latest.threeSecondViews / views) * 1000) / 1000
          : null,
        advocacy_rate: Math.round(advocacyRate * 10_000) / 10_000,
        conversion_rate: Math.round(conversionRate * 10_000) / 10_000,
        ingested_at: latest.ingestedAt,
      },
      delta_from_prior: prior ? {
        views: latest.views - prior.views,
        completion_points: latest.completionRate != null && prior.completionRate != null
          ? roundPoints(latest.completionRate - prior.completionRate) : null,
        skip_points: latest.skipRate != null && prior.skipRate != null
          ? roundPoints(latest.skipRate - prior.skipRate) : null,
        advocacy_actions: (latest.shares + latest.saves) - (prior.shares + prior.saves),
      } : null,
      checkpoints,
      verdict_eligible: ageHours >= 72,
      weakest_gate: diagnosis.gate,
      recommendation: diagnosis.recommendation,
    }];
  }).sort((a, b) => b.latest.ingested_at - a.latest.ingested_at);

  const missingDue = streams.reduce(
    (sum, stream) => sum + stream.checkpoints.filter((checkpoint) => checkpoint.due && !checkpoint.captured).length,
    0,
  );
  return { generated_at: now, checkpoints: [...CHECKPOINT_HOURS], streams, missing_due: missingDue };
}

function diagnose(metric: PerformanceMetrics, video: Video, advocacyRate: number, conversionRate: number): {
  gate: PerformanceStreamAnalysis["weakest_gate"];
  recommendation: string;
} {
  const duration = video.pkg?.estimatedLengthSeconds ?? 0;
  const completion = metric.completionRate;
  const watchRatio = duration > 0 && metric.avgWatchTime != null && metric.avgWatchTime > 0
    ? metric.avgWatchTime / duration : null;
  const candidates: Array<{ gate: "scroll_stop" | "retention" | "advocacy" | "conversion"; severity: number }> = [];
  // Scroll-stop evidence: IG skip rate, or FB 3-second views (its proxy).
  if (metric.skipRate != null) {
    candidates.push({ gate: "scroll_stop", severity: metric.skipRate / 0.5 });
  } else if (metric.threeSecondViews != null && metric.views > 0) {
    const impliedSkip = 1 - metric.threeSecondViews / Math.max(metric.views, 1);
    candidates.push({ gate: "scroll_stop", severity: impliedSkip / 0.5 });
  }
  if ((completion != null && completion > 0) || watchRatio != null) {
    const completionSeverity = completion != null && completion > 0 ? (1 - completion) / 0.75 : 0;
    const watchSeverity = watchRatio != null ? (1 - Math.min(1, watchRatio)) / 0.6 : 0;
    candidates.push({ gate: "retention", severity: Math.max(completionSeverity, watchSeverity) });
  }
  candidates.push({ gate: "advocacy", severity: Math.max(0, 1 - advocacyRate / 0.005) });
  // Conversion gate (2026-07-23): only meaningful once distribution exists —
  // 152K breakout views converted to 0 follows/0 link clicks while the only
  // follows ever came from an on-persona 3.6K-view post. Below 1K views the
  // expected count is ~0 and the gate would always scream.
  if (metric.views >= 1000) {
    candidates.push({ gate: "conversion", severity: Math.max(0, 1 - conversionRate / 0.001) });
  }
  if (!candidates.length) return {
    gate: "insufficient_data",
    recommendation: "Capture platform-separated retention, skip, share, and save metrics before changing the creative.",
  };
  const gate = candidates.sort((a, b) => b.severity - a.severity)[0].gate;
  if (gate === "scroll_stop") return {
    gate,
    recommendation: "Repair only frame zero and the opening sentence: show the complete anomaly immediately, then keep the rest stable for a clean test.",
  };
  if (gate === "retention") return {
    gate,
    recommendation: "Tighten the first soft or repeated middle beat and move the mechanism/payoff earlier; do not change the topic and visual style in the same test.",
  };
  if (gate === "conversion") return {
    gate,
    recommendation: "Distribution without conversion: check the funnel first (tappable link on FB captions, bio link, profile signature) and whether the delivered audience matches the app persona before changing the creative.",
  };
  return {
    gate,
    recommendation: "Strengthen the final transferable fact or consequence after the full payoff; do not add engagement bait or withhold the answer.",
  };
}

function roundPoints(delta: number): number {
  return Math.round(delta * 10_000) / 100;
}
