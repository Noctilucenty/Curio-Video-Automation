import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TopicEvidence {
  provider: string;
  label: string;
  url: string;
  metric: string;
  status: "candidate" | "confirmed";
}

export interface TopicCandidateScores {
  frameZero: number;
  factualStrength: number;
  visualTeachability: number;
  payoff: number;
  socialTransfer: number;
  feasibility: number;
  diversity: number;
  outlierEvidence: number;
  total: number;
}

export interface TopicCandidate {
  id: string;
  topic: string;
  category: string;
  targetLengthSeconds: number;
  recommendation: "recommended" | "viable" | "hold";
  frameZero: string;
  payoff: string;
  whyNow: string;
  productionRisk: string;
  scores: TopicCandidateScores;
  evidence: TopicEvidence[];
}

export interface TopicDiscoverySnapshot {
  collectedAt: string;
  contentSlot: string;
  strategyVersion: string;
  liveProviders: string[];
  unavailableProviders: string[];
  candidates: TopicCandidate[];
}

const SCORE_KEYS: Array<keyof Omit<TopicCandidateScores, "total">> = [
  "frameZero", "factualStrength", "visualTeachability", "payoff",
  "socialTransfer", "feasibility", "diversity", "outlierEvidence",
];

/**
 * Topic discovery is evidence import, never generic brainstorming. Codex's
 * connected vidIQ tools write this reviewed snapshot; the local dashboard can
 * then rank and select it without pretending the web research happened inside
 * Express. This boundary keeps connector credentials out of the web server.
 */
export function loadTopicDiscoverySnapshot(intelligenceDir: string): TopicDiscoverySnapshot | null {
  const file = join(intelligenceDir, "topic-shortlist.json");
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!validSnapshot(raw)) return null;
    return {
      ...raw,
      candidates: [...raw.candidates].sort((a, b) => b.scores.total - a.scores.total),
    };
  } catch {
    return null;
  }
}

function validSnapshot(raw: any): raw is TopicDiscoverySnapshot {
  if (!raw || typeof raw.collectedAt !== "string" || typeof raw.contentSlot !== "string" ||
      typeof raw.strategyVersion !== "string" || !Array.isArray(raw.liveProviders) ||
      !Array.isArray(raw.unavailableProviders) || !Array.isArray(raw.candidates)) return false;
  const ids = new Set<string>();
  return raw.candidates.length > 0 && raw.candidates.every((c: any) => {
    if (!c || typeof c.id !== "string" || ids.has(c.id) || typeof c.topic !== "string" ||
        typeof c.category !== "string" || !Number.isFinite(c.targetLengthSeconds) ||
        !["recommended", "viable", "hold"].includes(c.recommendation) ||
        typeof c.frameZero !== "string" || typeof c.payoff !== "string" ||
        typeof c.whyNow !== "string" || typeof c.productionRisk !== "string" ||
        !Array.isArray(c.evidence) || !c.scores) return false;
    ids.add(c.id);
    return SCORE_KEYS.every((key) => Number.isFinite(c.scores[key]) && c.scores[key] >= 0 && c.scores[key] <= 10) &&
      Number.isFinite(c.scores.total) && c.scores.total >= 0 && c.scores.total <= 100 &&
      c.evidence.every((e: any) => e && typeof e.provider === "string" && typeof e.label === "string" &&
        typeof e.url === "string" && /^https:\/\//.test(e.url) && typeof e.metric === "string" &&
        ["candidate", "confirmed"].includes(e.status));
  });
}
