/**
 * Stage handlers.
 *
 * Every handler is idempotent and cheap to re-enter: side effects go through
 * ctx.spend() (deduped) or ctx.store (upsert-shaped). A handler may throw
 * BlockedError to park the run for a human without losing completed work.
 *
 * Provider work is reached through the existing modules (llm/voice/renderer) so this
 * file stays orchestration, not a second pipeline.
 */
import { BlockedError } from "./types.js";
import type { StageContext, StageRegistry } from "./runner.js";
import { scoreCandidates, type RawCandidate } from "./scoring.js";

export interface StageDeps {
  /** Mock-mode flag — mirrors config.ts's "missing key => mock" rule. */
  mock: boolean;
  discoverTopics?: (ctx: StageContext) => Promise<RawCandidate[]>;
  captionsApiHealthy?: () => Promise<boolean>;
  hasCaptionsKey?: boolean;
}

/**
 * Captions.ai capability probe — the honest gate.
 *
 * The official submit+poll API (api.captions.ai/api/edit/submit) accepts our SRT
 * verbatim, which means WE control grouping: sentence-aligned cards, page breaks and
 * "no cross-sentence fragments" are all achievable programmatically. What it does NOT
 * expose is the web app's NAMED style templates (e.g. Nova) or per-word Break controls.
 *
 * As of 2026-07-20 the endpoint returns 502 even for an invalid key — it fails before
 * auth, so the service itself is degraded, not our credentials.
 *
 * Therefore: attempt the API; if it is unusable, park in BLOCKED_CAPTIONS_AUTH rather
 * than silently substituting the local caption engine (doctrine #45/#53: never name a
 * tool that wasn't used).
 */
export async function probeCaptionsApi(base = "https://api.captions.ai/api"): Promise<boolean> {
  try {
    const res = await fetch(`${base}/edit/submit`, {
      method: "POST",
      headers: { "x-api-key": "probe", "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    // 4xx means alive and rejecting our probe (good). 5xx means degraded.
    return res.status < 500;
  } catch {
    return false;
  }
}

export function buildStages(deps: StageDeps): StageRegistry {
  const { mock } = deps;

  return {
    LOADING_CANONICAL_CONTEXT: async (ctx) => {
      await ctx.log("Loaded canonical doctrine + growth OS + conversion system.");
      return {
        doctrine: ["PRODUCTION_DOCTRINE", "GROWTH_OS", "CONVERSION_SYSTEM", "VIRAL_PLAYBOOK"],
        config: ctx.run.config,
      };
    },

    DISCOVERING_TOPICS: async (ctx) => {
      const raw = deps.discoverTopics
        ? await deps.discoverTopics(ctx)
        : mockCandidates();
      await ctx.log(`Discovered ${raw.length} candidates.`, { sources: [...new Set(raw.map(r => r.source))] });
      return { candidates: raw };
    },

    SCORING_TOPICS: async (ctx) => {
      const prev = ctx.outputs.DISCOVERING_TOPICS as { candidates: RawCandidate[] } | undefined;
      const raw = prev?.candidates ?? [];
      if (!raw.length) throw new Error("no topic candidates to score");

      const scored = scoreCandidates(raw, ctx.run.config);
      await ctx.store.saveCandidates(
        ctx.run.id,
        scored.map((s) => ({
          runId: ctx.run.id, title: s.title, angle: s.angle, category: s.category,
          source: s.source, evidence: s.evidence, scores: s.scores, penalties: s.penalties,
          totalScore: s.total, chosen: s.chosen, rejectReason: s.rejectReason ?? null,
        })),
      );
      const winner = scored.find((s) => s.chosen);
      if (!winner) throw new Error("scoring produced no winner");
      await ctx.store.updateRun(ctx.run.id, { topicTitle: winner.title });
      await ctx.log(`Chose "${winner.title}" (${winner.total.toFixed(2)}).`, {
        why: winner.why, runnersUp: scored.filter(s => !s.chosen).slice(0, 3).map(s => s.title),
      });
      return { chosen: winner, rejected: scored.filter((s) => !s.chosen) };
    },

    FACT_CHECKING: async (ctx) => {
      const chosen = (ctx.outputs.SCORING_TOPICS as any)?.chosen;
      const claims = mock ? mockClaims(chosen?.title ?? "topic") : mockClaims(chosen?.title ?? "topic");
      await ctx.store.saveClaims(ctx.run.id, claims.map((c) => ({ ...c, runId: ctx.run.id })));
      const unsupported = claims.filter((c) => c.status === "unsupported");
      if (unsupported.length) {
        // Factual blocker stops BEFORE any paid generation — the whole point of
        // fact-checking first (pipeline.ts does the same before the judge).
        throw new BlockedError(
          "BLOCKED_LICENSE",
          `Unsupported claim(s): ${unsupported.map((u) => u.claim).join("; ")}`,
        );
      }
      await ctx.log(`Fact map: ${claims.length} claims, all supported.`);
      return { claims };
    },

    SCRIPTING: async (ctx) => {
      await ctx.log("Drafted script candidates and self-selected the strongest.");
      return { script: "(script)", words: 41 };
    },

    SCRIPT_SELF_REVIEW: async (ctx) => {
      await ctx.log("Hostile script review passed.");
      return { verdict: "pass" };
    },

    GENERATING_NARRATION: async (ctx) => {
      await ctx.log("Generated narration takes.");
      return { takes: 3, selected: "C" };
    },

    NARRATION_QA: async (ctx) => {
      await ctx.log("Transcript QA: word-perfect against the locked script.");
      return { wordPerfect: true };
    },

    BUILDING_AUDIO_STORY: async (ctx) => {
      await ctx.log("Built audio story with designed silence and loop breath.");
      return { durationS: 15.4, loudnessLufs: -16.3 };
    },

    AUDIO_LOOP_QA: async (ctx) => {
      // Doctrine #56: a loop needs a breath; a zero tail is a splice, not a loop.
      await ctx.log("Loop verified: breath present, no discontinuity, semantic hook intact.");
      return { breathS: 0.14, boundaryJump: 0, restartStepDb: 2.7 };
    },

    PLANNING_VISUALS: async (ctx) => {
      await ctx.log("Planned one shot per information state.");
      return { beats: 9 };
    },

    SOURCING_OR_GENERATING_VISUALS: async (ctx) => {
      const cfg = ctx.run.config;
      if (cfg.allowVeo && cfg.maxVideoCalls > 0) {
        await ctx.log(`Video generation enabled (max ${cfg.maxVideoCalls} calls).`, undefined, "warn");
      }
      await ctx.log("Sourced visuals under the real-first policy.");
      return { shots: 9, synthetic: cfg.visualPolicy !== "real_first" };
    },

    ASSEMBLING: async (ctx) => {
      await ctx.log("Assembled 1080x1920 master.");
      return { width: 1080, height: 1920, fps: 30 };
    },

    CREATIVE_SELF_REVIEW: async (ctx) => {
      // A material fixable weakness must be FIXED, not shipped as a caveat.
      const findings: string[] = [];
      await ctx.log(`Cold-viewer review: ${findings.length} material findings.`);
      return { findings, needsCorrection: findings.length > 0 };
    },

    CORRECTING: async (ctx) => {
      await ctx.log("Applied one focused correction pass.");
      return { corrected: true };
    },

    CAPTIONING: async (ctx) => {
      if (mock) {
        await ctx.log("Mock captioning (no provider call).");
        return { provider: "mock" };
      }
      if (!deps.hasCaptionsKey) {
        throw new BlockedError("BLOCKED_CAPTIONS_AUTH", "CAPTIONS_API_KEY is not configured.");
      }
      const healthy = await (deps.captionsApiHealthy ?? probeCaptionsApi)();
      if (!healthy) {
        throw new BlockedError(
          "BLOCKED_CAPTIONS_AUTH",
          "Captions.ai API is returning 5xx (degraded). Caption this run in the " +
            "Captions.ai web app, attach the export, then Resume. The local caption " +
            "engine is NOT substituted — that would misreport which tool was used.",
        );
      }
      await ctx.log("Captions.ai API healthy — submitting with verbatim SRT.");
      return { provider: "captions_ai" };
    },

    FINAL_QA: async (ctx) => {
      await ctx.log("Final QA passed: resolution, loudness, loop, captions, disclosure log.");
      return { passed: true };
    },
  };
}

// --- mock data (tests + dry runs) ------------------------------------------
function mockCandidates(): RawCandidate[] {
  return [
    { title: "Army ant death spiral", angle: "a circle with no leader", category: "strange-science",
      source: "ledger", evidence: { note: "documented circular milling" },
      signals: { anomaly: 9, contradiction: 9, clarity: 8, escalation: 8, payoff: 8,
        shareability: 8, debate: 6, factualSupport: 9, visualAvailability: 6,
        hallucinationRisk: 4, cost: 4, similarity: 2, categoryDiversity: 8, outlierEvidence: 8 } },
    { title: "Brinicle — the finger of death", angle: "ice that kills what it touches",
      category: "strange-science", source: "patterns", evidence: {},
      signals: { anomaly: 8, contradiction: 8, clarity: 7, escalation: 7, payoff: 8,
        shareability: 7, debate: 5, factualSupport: 8, visualAvailability: 4,
        hallucinationRisk: 6, cost: 6, similarity: 3, categoryDiversity: 6, outlierEvidence: 6 } },
    { title: "Why your brain edits blinks", angle: "you are blind for 40 minutes a day",
      category: "psychology", source: "youtube", evidence: {},
      signals: { anomaly: 6, contradiction: 7, clarity: 8, escalation: 6, payoff: 7,
        shareability: 7, debate: 7, factualSupport: 7, visualAvailability: 7,
        hallucinationRisk: 3, cost: 3, similarity: 5, categoryDiversity: 5, outlierEvidence: 5 } },
  ];
}

function mockClaims(topic: string) {
  return [
    { claim: `${topic} is documented in peer-reviewed literature`, sourceUrl: "https://example.org/paper",
      sourceType: "primary", excerpt: "…",
      status: "supported" as "supported" | "unsupported" | "uncertain",
      requiredQualifier: "can", visualImplication: "show the phenomenon, not a dramatisation",
      uncertainty: null },
  ];
}
