# Curio-Automation — operating rules for every session

This repo is Curio's short-form video factory + viral intelligence layer.
OpenAI = brain · ElevenLabs = voice · local ffmpeg = renderer · this DB = memory.

## Read before content/growth work
1. `docs/curio/CURIO_MASTER_CONTEXT.md` — product, brand, audience.
2. `docs/curio/VIRAL_PLAYBOOK.md` — confirmed/provisional/rejected rules.
3. `docs/curio/CONTENT_ENGINE_STATE.md` — pipeline + where live counts come from.
4. `data/viral-intelligence/` — structured trend findings (vidIQ + analytics).
5. **Before any video PRODUCTION work**: `docs/curio/PRODUCTION_DOCTRINE.md` —
   locked production-quality lessons (REP-2's four review rounds). MANDATORY:
   every finished master runs `node tools/finalqa.mjs <mp4>` and passes ALL
   automated checks BEFORE going to any reviewer. Production-defect lessons
   lock immediately; retention/tension lessons stay PROVISIONAL until
   REP-1/2/3 analytics are compared.

## Evidence discipline (non-negotiable)
Raw findings never become permanent rules automatically. Promotion path:
observation → metric recorded → compared against prior evidence → rule marked
CONFIRMED or PROVISIONAL → playbook + rules DB updated. One anecdotal result
never overwrites a confirmed rule; external trend patterns start as `candidate`
in TREND_INTELLIGENCE, and only reach `approved-patterns.json` / the rules DB
after Curio's own posted results (or ≥2 independent outliers) support them.
Separate observations, hypotheses, confirmed rules, rejected rules — always.

## This machine (8GB Mac) — run heavy processes ONE AT A TIME
Uncapped Node balloons into swap and macOS SIGKILLs it (exit 137) with no
error output — repeated tsc/vitest deaths on 2026-07-14 cost an hour. The repo
scripts are now hardened: `npm run typecheck` / `npm test` / `npm run build`
carry `NODE_OPTIONS='--max-old-space-size=1408'`, tsconfig is `incremental`
(cache in node_modules/.cache), and vitest.config.ts forces a single forked
worker with no file parallelism. USE THE NPM SCRIPTS, not bare `npx tsc`/`npx
vitest`. Never run two of tsc/vitest/ffmpeg-render at once; check for other
sessions' node processes (`ps aux | grep node`) before starting a heavy one.
Renders: ONE process, ≤2 threads, RSS <750MB hard cap (see PRODUCTION_DOCTRINE).

## Hard rules
- Model: newest full-strength GPT — currently the `gpt-5.6` alias (flagship
  gpt-5.6-sol). Leon's call 2026-07-12: best quality over cost; never mini/nano
  for content decisions. (The main curio app's card engine keeps its own model
  rule.) Reasoning is routed per task (src/llm.ts PURPOSE_REASONING): xhigh for
  fact-check, high for generation/judging/learning, low for parsing;
  deterministic checks (loudness, schema, caption limits) stay in CODE, never
  a model. Exact response model is recorded per generation; PIN a snapshot via
  OPENAI_MODEL during controlled A/B cohorts.
- Factual gate: a separate fact-check stage (src/factcheck.ts) runs BEFORE the
  creative judge and before any render — contested psychology (ego depletion,
  power posing, learning styles, …) is rejected in code; the LLM pass demands
  named sources and flags overclaimed absolutes. A strong judge approving a
  contested claim is exactly how the ego-depletion card shipped; the gate is
  structural now.
- Audio gate: every render is loudnorm'd to −16 LUFS/−1.5 dBTP and hard-fails
  outside integrated [−20, −12] LUFS or true peak > −0.9 dBTP. Audio files are
  declared in assets/audio-assets.json (role/license/approved) — no magic
  filenames, no unverified-license asset auto-mixed.
- FORMATS: static cards are FROZEN (Leon 2026-07-12) — the API refuses card
  topics/generation (403) until CARDS_FROZEN=0. Primary bet: atmospheric
  survival mystery narrative (docs/curio/NEXT_EXPERIMENTS.md).
- ONE-OUTCOME DOCTRINE (Leon 2026-07-12): every video is designed for low
  cognitive load and ONE primary viewer outcome (retention | shares | saves |
  comments | likes) + at most one secondary — never all at once; stacked
  tactics read as manipulative and dense. Curio default: retention primary,
  shares secondary. Think in viewer mechanisms (first-frame comprehension →
  curiosity → evidence → payoff → natural response), not "psychology effects";
  a mechanism must serve the subject naturally, never a forced bias checklist.
  Structural: the package schema requires primary_outcome/secondary_outcome/
  outcome_moment; the judge must name the exact beat producing the outcome and
  return outcome_verified — a false verdict BLOCKS publication in
  meetsThresholds regardless of numeric scores (vague "creates curiosity"
  claims fail the verdict). Learning receives each video's outcome fields,
  surface, and package prompt version, so v4-vs-v5 and retention-first vs
  shares-first cohorts are comparable once published analytics exist.
  Published analytics — not theory or judge scores — decide whether the
  mechanism worked. Full text: ONE_OUTCOME_DOCTRINE in src/prompts.ts.
- Factual accuracy over drama: no invented stats, no AI-slop psychology claims,
  no fake mysteries presented as verified fact.
- Category diversity: don't let generation collapse onto easy psychology/mystery
  topics; rotate across the categories in CURIO_MASTER_CONTEXT.
- CTA safety: never "download now" until App Store live. Soft signatures only.
- Never commit secrets. `.env` is gitignored; keys live only there.
- Autopilot flow: implement → test → commit → push → verify. Stop only for
  irreversible/production-destructive actions.
- vidIQ access: Claude's live vidIQ MCP connector (available in connected
  sessions) is the research layer; results are persisted to
  `data/viral-intelligence/` so headless sessions and other agents can read
  them. Never scrape authenticated pages or handle browser cookies.

## Analytics drops
When Leon pastes video analytics: `POST /api/performance/ingest {raw}` →
`POST /api/learning/run` → report improvementDelta, platform notes, calibration
notes, new rules. Ledger discipline: add one entry per posted video to
`docs/curio/EXPERIMENT_LEDGER.md` AND to `data/posted-experiments.json`
(machine copy; import with `npx tsx tools/import_posted_experiments.ts`).
**Platform-separated is mandatory AND code-enforced**: IG views and FB views
recorded separately — combined totals are not an optimization target. Both
ingestion paths REFUSE a reels row without an explicit surface (instagram |
facebook), and learning aggregates per (platform, surface), so a combined
Meta total cannot enter the loop even by accident. Capture checklist
(retention curve points, view sources, creative metadata): use
`docs/curio/ANALYTICS_CAPTURE_TEMPLATE.md` for every post, no exceptions.
