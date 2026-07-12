# Curio-Automation — operating rules for every session

This repo is Curio's short-form video factory + viral intelligence layer.
OpenAI = brain · ElevenLabs = voice · local ffmpeg = renderer · this DB = memory.

## Read before content/growth work
1. `docs/curio/CURIO_MASTER_CONTEXT.md` — product, brand, audience.
2. `docs/curio/VIRAL_PLAYBOOK.md` — confirmed/provisional/rejected rules.
3. `docs/curio/CONTENT_ENGINE_STATE.md` — pipeline + where live counts come from.
4. `data/viral-intelligence/` — structured trend findings (vidIQ + analytics).

## Evidence discipline (non-negotiable)
Raw findings never become permanent rules automatically. Promotion path:
observation → metric recorded → compared against prior evidence → rule marked
CONFIRMED or PROVISIONAL → playbook + rules DB updated. One anecdotal result
never overwrites a confirmed rule; external trend patterns start as `candidate`
in TREND_INTELLIGENCE, and only reach `approved-patterns.json` / the rules DB
after Curio's own posted results (or ≥2 independent outliers) support them.
Separate observations, hypotheses, confirmed rules, rejected rules — always.

## Hard rules
- Model: full-strength GPT-5 line (gpt-5.1 or newer) — Leon's call 2026-07-12:
  best quality over cost for the video factory. Never downgrade to mini/nano.
  (The main curio app's card engine keeps its own model rule.) Config in `.env`.
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
`docs/curio/EXPERIMENT_LEDGER.md`.
