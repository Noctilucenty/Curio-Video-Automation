# Content engine state

Two engines exist. Do not conflate them.

## 1. Video factory (THIS repo)

Pipeline: topic → gpt-5.6 package (hooks/script/captions/copy) → FACT-CHECK
gate (contested-claims screen in code + xhigh-reasoning LLM pass; rejects
before judging) → judge with rewrite loop (max 2 regens; calibration rules
tune the judge) → ElevenLabs narration → renderer (loudness-gated: −16 LUFS
target, hard-fail outside [−20,−12] LUFS / true peak > −0.9 dBTP) → review
dashboard (:8790) → manual post → analytics ingest (IG/FB separated) →
learning run → new rules injected into the next generation.
Exact response model recorded per generation; audio via assets/audio-assets.json
registry (no magic filenames). Cards FROZEN (API 403) until unfrozen.

**Live counts come from the running server** (`/api/videos`, `/api/learning/rules`,
`/api/learning/runs`, `/api/performance/summary`) or `data/automation.json` —
never guess them. Snapshot at 2026-07-12 (post-import):
25 videos (15 published — incl. the 4 REAL posted experiments + mock-render
era, 6 ready_for_review, 2 generated, 1 needs_revision, 1 failed) ·
9 active rules · 21 metrics rows · 2 learning runs · 54 recorded generations.

Provider state: OpenAI LIVE (gpt-5.6) · ElevenLabs LIVE (narrator
`UBtJzywcDa3wB8w48g0v`) · renderer = local ffmpeg (no-avatar; HeyGen dormant
behind `RENDERER=heygen`, no avatar will be used) · Captions.ai parked (key was
rejected; likely unnecessary — TTS scripts have no fillers/silences and we burn
our own captions).

**Ground truth (2026-07-12):** Curio's four REAL posted videos are imported
(`data/posted-experiments.json` → `tools/import_posted_experiments.ts`), with
platform-separated analytics. Third Man Factor is the only retention winner;
the primary bet is "atmospheric survival mystery with immediate visual
evidence" — three replications + two controlled A/Bs queued in
`docs/curio/NEXT_EXPERIMENTS.md`.

**Blocking quality issue:** local renderer v1 (narrated) REJECTED in review
(EXPERIMENT_LEDGER EXP-202607-02). Renderer v2 requirements: text-as-
cinematography or eerie footage layer, plus the audio stack (drone bed,
ticking, pre-punch silence, signature boom) — the loudness gate and audio
registry now exist; still waiting on Leon for licensed audio files
(drone/tick/boom; Synthwave.mp3 is registered but license-unverified and
mood-mismatched) and 2–3 reference reels. Do not publish narrated local-render
output before v2. The Third Man-class posts were produced externally in
Captions.ai — that path remains available for the replication experiments.

## 2. Card content engine (main `curio` repo — NOT this repo)

Card generation/lifting/translation/gating for the app itself. State as last
recorded (2026-07-08–09, from project memory — verify against the production
API before acting): batch lifting complete for FAST/SOURCE_CHECK routes;
remaining routing FACT_CHECK_WAVE: 5 history cards, SKIP_OR_REJECT: 18;
live health ~145 published / 152 total / 122 translated. Backtesting strategy
(elite-card pattern analysis) recommended but not yet built. Any work there
happens in the `curio` repo with its own deploy (Render, main branch only).

## Backtesting mapping (do not build a second engine)

The spec'd "backtest comparison engine" IS the factory's learning run:
Curio's own results = highest-priority evidence (`rule_validation`,
`judge_vs_actual`, `improvement_delta`, per-platform aggregates); external
outliers = reference evidence (data/viral-intelligence + WINNING_REFERENCES).
Confidence language is enforced by prompts (no certainty claims, small-n
flagged). Category diversity is enforced editorially at topic selection —
check the last 10 videos' categories before queueing new topics.
