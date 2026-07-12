// Viral-intelligence bridge: the committed data/viral-intelligence/ folder is
// the durable memory shared by Claude sessions, ChatGPT research and this
// factory. Approved patterns (evidence-backed only — see CLAUDE.md discipline)
// are injected into every generation prompt; candidates never are.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ApprovedPattern {
  id: string;
  pattern: string;
  /** Instruction the generator can obey directly. */
  guidance: string;
  evidence: string[];
  promotedAt: string;
}

export interface TrendVideo {
  videoId: string;
  title: string;
  url: string;
  platform: string;
  views: number;
  hookType: string;
  retentionMechanic: string;
  curioAdaptation: string;
  status: "candidate" | "approved" | "rejected";
}

/**
 * Load approved patterns; malformed entries are skipped and a missing/broken
 * file yields [] — trend data must never be able to break video generation.
 */
export function loadApprovedPatterns(intelligenceDir: string): ApprovedPattern[] {
  const file = join(intelligenceDir, "approved-patterns.json");
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(raw?.patterns) ? raw.patterns : [];
    return list.filter(
      (p: any): p is ApprovedPattern =>
        typeof p?.id === "string" &&
        typeof p?.pattern === "string" &&
        typeof p?.guidance === "string" &&
        Array.isArray(p?.evidence) &&
        p.evidence.length > 0 && // no evidence, no injection — the discipline is structural
        typeof p?.promotedAt === "string",
    );
  } catch {
    return [];
  }
}

/** Structural validation for trend snapshot files (ingest + tests). */
export function validateTrendSnapshot(raw: any): string[] {
  const issues: string[] = [];
  if (typeof raw?.collectedAt !== "string") issues.push("missing collectedAt");
  if (typeof raw?.source !== "string") issues.push("missing source");
  if (!Array.isArray(raw?.videos)) {
    issues.push("videos must be an array");
    return issues;
  }
  const seen = new Set<string>();
  raw.videos.forEach((v: any, i: number) => {
    for (const k of ["videoId", "title", "url", "hookType", "retentionMechanic", "curioAdaptation"]) {
      if (typeof v?.[k] !== "string" || !v[k].trim()) issues.push(`videos[${i}] missing ${k}`);
    }
    if (typeof v?.views !== "number") issues.push(`videos[${i}] missing views`);
    if (!["tiktok", "reels", "shorts"].includes(v?.platform)) issues.push(`videos[${i}] bad platform`);
    if (!["candidate", "approved", "rejected"].includes(v?.status)) issues.push(`videos[${i}] bad status`);
    if (v?.videoId) {
      if (seen.has(v.videoId)) issues.push(`videos[${i}] duplicate videoId ${v.videoId}`);
      seen.add(v.videoId);
    }
  });
  return issues;
}
