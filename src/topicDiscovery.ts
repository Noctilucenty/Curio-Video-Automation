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
  storyPower: number;
  surprise: number;
  tension: number;
  factualStrength: number;
  visualProof: number;
  payoff: number;
  socialTransfer: number;
  feasibility: number;
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
  /** Research items retained in the file but rejected by the non-compensable
   * editorial gate. They never appear as ideas in the dashboard. */
  screenedOutCount?: number;
}

const SCORE_KEYS: Array<keyof Omit<TopicCandidateScores, "total">> = [
  "frameZero", "storyPower", "surprise", "tension", "factualStrength",
  "visualProof", "payoff", "socialTransfer", "feasibility", "outlierEvidence",
];

/** No average can rescue a dull idea. Every dimension below is a hard gate. */
export const ELITE_TOPIC_GATE = {
  total: 90,
  frameZero: 9,
  storyPower: 9,
  surprise: 9,
  tension: 8,
  factualStrength: 9,
  visualProof: 8,
  payoff: 9,
  socialTransfer: 9,
  feasibility: 7,
  outlierEvidence: 8,
} as const;

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
    const candidates = raw.candidates.filter(passesEliteTopicGate);
    return {
      ...raw,
      screenedOutCount: raw.candidates.length - candidates.length,
      candidates: candidates.sort((a, b) => b.scores.total - a.scores.total),
    };
  } catch {
    return null;
  }
}

export function passesEliteTopicGate(candidate: TopicCandidate): boolean {
  const s = candidate.scores;
  return candidate.recommendation === "recommended" &&
    s.total >= ELITE_TOPIC_GATE.total &&
    s.frameZero >= ELITE_TOPIC_GATE.frameZero &&
    s.storyPower >= ELITE_TOPIC_GATE.storyPower &&
    s.surprise >= ELITE_TOPIC_GATE.surprise &&
    s.tension >= ELITE_TOPIC_GATE.tension &&
    s.factualStrength >= ELITE_TOPIC_GATE.factualStrength &&
    s.visualProof >= ELITE_TOPIC_GATE.visualProof &&
    s.payoff >= ELITE_TOPIC_GATE.payoff &&
    s.socialTransfer >= ELITE_TOPIC_GATE.socialTransfer &&
    s.feasibility >= ELITE_TOPIC_GATE.feasibility &&
    s.outlierEvidence >= ELITE_TOPIC_GATE.outlierEvidence &&
    candidate.evidence.some((e) => e.status === "confirmed") &&
    candidate.evidence.some((e) => e.status === "candidate");
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
      Number.isFinite(c.scores.total) &&
      c.scores.total === SCORE_KEYS.reduce((sum, key) => sum + c.scores[key], 0) &&
      c.evidence.every((e: any) => e && typeof e.provider === "string" && typeof e.label === "string" &&
        typeof e.url === "string" && /^https:\/\//.test(e.url) && typeof e.metric === "string" &&
        ["candidate", "confirmed"].includes(e.status));
  });
}
