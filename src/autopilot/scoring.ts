/**
 * Topic scoring.
 *
 * Deterministic and pure so it is testable and so the scorecard is auditable — the
 * dashboard shows WHY a topic won and which ones lost. Signals arrive 0..10 from the
 * discovery adapters; weights encode Curio's confirmed learning, penalties encode the
 * failure modes that produced NO-GOs (context-first openings, repetitive visuals,
 * payoff that isn't socially transferable).
 */
import type { RunConfig } from "./types.js";

export interface RawCandidate {
  title: string;
  angle?: string;
  category?: string;
  source: string;
  evidence?: unknown;
  signals: {
    anomaly: number;             // frame-zero anomaly strength
    contradiction: number;       // immediate contradiction
    clarity: number;             // low-cognitive premise clarity
    escalation: number;
    payoff: number;              // genuine wow
    shareability: number;        // social currency
    debate: number;              // comment potential
    factualSupport: number;
    visualAvailability: number;  // credible visuals exist
    hallucinationRisk: number;   // HIGHER = worse
    cost: number;                // HIGHER = worse
    similarity: number;          // to recent Curio videos; HIGHER = worse
    categoryDiversity: number;
    outlierEvidence: number;     // real outlier support
  };
}

export interface ScoredCandidate extends RawCandidate {
  scores: Record<string, number>;
  penalties: Record<string, number>;
  total: number;
  chosen: boolean;
  why: string;
  rejectReason?: string;
}

/**
 * Weights. Scroll-stop and payoff dominate because that is what the posted analytics
 * actually supported: Harrison passed scroll-stop + retention on a frame-zero anomaly
 * and failed ADVOCACY, so shareability is weighted above debate but below payoff.
 */
const WEIGHTS: Record<keyof RawCandidate["signals"], number> = {
  anomaly: 2.0,
  contradiction: 1.8,
  clarity: 1.5,
  escalation: 1.2,
  payoff: 1.8,
  shareability: 1.5,
  debate: 0.6,
  factualSupport: 1.6,
  visualAvailability: 1.3,
  hallucinationRisk: -1.4,   // negative: risk subtracts
  cost: -0.7,
  similarity: -1.2,
  categoryDiversity: 0.7,
  outlierEvidence: 0.9,
};

export function scoreCandidates(raw: RawCandidate[], config: RunConfig): ScoredCandidate[] {
  const scored = raw.map((c) => {
    const scores: Record<string, number> = {};
    let total = 0;
    for (const [k, w] of Object.entries(WEIGHTS) as [keyof RawCandidate["signals"], number][]) {
      const v = c.signals[k] ?? 0;
      const contribution = v * w;
      scores[k] = Number(contribution.toFixed(3));
      total += contribution;
    }

    const penalties: Record<string, number> = {};
    const pen = (name: string, amount: number) => { penalties[name] = amount; total -= amount; };

    // The failure modes that have actually produced rejections.
    if (c.signals.clarity < 6) pen("premise_fragment", 6);
    if (c.signals.anomaly < 6) pen("no_frame_zero_anomaly", 8);
    if (c.signals.contradiction < 6) pen("context_first_opening", 6);
    if (c.signals.payoff < 6) pen("weak_or_merely_named_reveal", 7);
    if (c.signals.shareability < 6) pen("payoff_not_transferable", 5);
    if (c.signals.visualAvailability < 5) pen("generic_atmosphere_risk", 4);
    if (c.signals.hallucinationRisk >= 7) pen("likely_ai_artifacts", 6);
    if (c.signals.similarity >= 7) pen("repetitive_visuals", 5);
    if (config.factualRisk === "strict" && c.signals.factualSupport < 7) {
      pen("insufficient_factual_support", 10);
    }
    // A run that forbids synthetic visuals cannot rescue a topic with no real footage.
    if (config.visualPolicy === "real_first" && c.signals.visualAvailability < 4) {
      pen("no_real_footage_available", 8);
    }

    const why =
      `anomaly ${c.signals.anomaly}/10, contradiction ${c.signals.contradiction}/10, ` +
      `payoff ${c.signals.payoff}/10, factual ${c.signals.factualSupport}/10` +
      (Object.keys(penalties).length ? `; penalised: ${Object.keys(penalties).join(", ")}` : "");

    const out: ScoredCandidate = { ...c, scores, penalties,
      total: Number(total.toFixed(3)), chosen: false, why, rejectReason: undefined };
    return out;
  });

  scored.sort((a, b) => b.total - a.total);
  if (scored.length) {
    scored[0].chosen = true;
    for (const s of scored.slice(1)) {
      s.rejectReason = `lower total (${s.total.toFixed(2)} vs ${scored[0].total.toFixed(2)})`;
    }
  }
  return scored;
}
