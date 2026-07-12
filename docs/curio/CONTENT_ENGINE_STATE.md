# Content engine state

Two engines exist. Do not conflate them.

## 1. Video factory (THIS repo)

Pipeline: topic → gpt-5-mini package (hooks/script/captions/copy) → judge with
rewrite loop (max 2 regens; calibration rules tune the judge) → ElevenLabs
narration → renderer → review dashboard (:8790) → manual post → analytics
ingest → learning run → new rules injected into the next generation.

**Live counts come from the running server** (`/api/videos`, `/api/learning/rules`,
`/api/learning/runs`, `/api/performance/summary`) or `data/automation.json` —
never guess them. Snapshot at 2026-07-12:
14 videos (11 published — mock-render era, 2 ready_for_review, 1 failed) ·
9 active rules (5 seed + 3 learned + 1 judge-calibration) · 17 metrics rows ·
2 learning runs · 30 recorded generations.

Provider state: OpenAI LIVE (gpt-5-mini) · ElevenLabs LIVE (narrator
`UBtJzywcDa3wB8w48g0v`) · renderer = local ffmpeg (no-avatar; HeyGen dormant
behind `RENDERER=heygen`, no avatar will be used) · Captions.ai parked (key was
rejected; likely unnecessary — TTS scripts have no fillers/silences and we burn
our own captions).

**Blocking quality issue:** local renderer v1 REJECTED in review (see
EXPERIMENT_LEDGER EXP-202607-02). Renderer v2 requirements: text-as-
cinematography (large centered metronome beats, scale hierarchy) or eerie
footage layer, plus the audio stack (drone bed, ticking, pre-punch silence,
signature boom). Waiting on Leon: 2–3 reference reels, licensed audio files
(drone/tick/boom), font decision. Do not publish local-render output before v2.

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
