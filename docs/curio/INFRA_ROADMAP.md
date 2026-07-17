# Curio factory — infrastructure roadmap (locked 2026-07-14, Codex-approved order)

Gate: **REP-3 Codex review finishes first.** No wiring before that verdict.
Rule: do NOT wire overlapping providers in parallel (no Veo+Runway+Luma
comparison loop). One primary per capability; fallbacks stay manual.

Target stack:
`vidIQ + YouTube/TikTok discovery → strongest reasoning model → licensed stock /
gpt-image-1 plates / at most one Seedance hero → ElevenLabs → ffmpeg/Captions → YouTube/Instagram analytics
→ evidence ledger`

## 1. YouTube Data + Analytics APIs — HIGHEST PRIORITY
- Data API: recent mystery/science Shorts, outlier ratios (views vs channel
  size), titles, durations, publish dates → discovery evidence.
- Analytics API: Curio's own avg view duration, engaged views, shares,
  comments, likes, retention curves → feeds the experiment ledger.
- Purpose: turns "self-training" into measured evidence, not model opinion.
- Docs: developers.google.com/youtube/v3/docs · /youtube/analytics/reference
- LEON PREREQS: Google Cloud project; Data API key; OAuth consent for the
  Curio channel (Analytics API needs channel-owner OAuth, not just a key).

## 2. Instagram Insights API
- Automate the 24h/72h/7d drops for every Curio Reel; platform-separated
  results into the existing ledger (IG/FB split stays mandatory).
- Scope: Curio's own Business/Creator account only — NOT competitor scraping.
- LEON PREREQS: IG Business/Creator account linked to a Facebook Page; Meta
  developer app; long-lived access token.

## 3. Controlled hero-motion generation — Seedance default, Veo exceptional
- Current default for an indispensable hero-motion shot: Seedance-2 through the
  live vidIQ connector, one proof clip before any continuation.
- Default remainder: `gpt-image-1` plates, licensed stock, and local animation.
- Veo 3.1 is NOT the factory default. Harrison v1 showed obvious AI appearance,
  human/object hallucination, and high per-second cost across six clips. Use it
  only as an explicitly justified exception for a non-human/object event that
  simpler construction cannot teach.
- Never batch multiple paid motion generations before the hero passes mobile
  inspection. Narration and real source audio stay outside generated clips.
- Runway and Luma remain manual fallbacks, not wired providers.
- Docs: ai.google.dev/gemini-api/docs/veo
- Provider credentials/credits are checked only after the brief passes the
  visual-complexity gate.

## 4. Shutterstock API — licensed production footage
- Search/license/download with preserved asset IDs → license log becomes
  automatic. Fixes the Dead Water footage-quality/licensing pain.
- Pexels API = free fallback (quality/historical specificity weaker).
- LEON PREREQS: Shutterstock subscription + API app credentials.

## 5. Twelve Labs — LATER (at ~50-100 reference/posted videos)
- Natural-language moment search across video+audio+captions ("openings
  where the anomaly precedes narration", "reveals with silence before
  them", "caption density strongest vs weakest").
- Until the library is big enough, Codex analyzes references manually.

## No-code, use immediately (Leon, no wiring)
- YouTube Studio Trends + Inspiration tabs (searches, breakouts, gaps).
- TikTok Creative Center Trends + Top Ads (treat ad patterns as
  PROVISIONAL — paid behavior ≠ organic).
- Apply for Google Trends API alpha; factory must not depend on it until
  access is granted.

## Explicitly deferred / rejected for now
- Veo as a default or multi-clip human-scene generator.
- Runway, Luma as wired providers (manual fallback only).
- Any additional general brainstorming model.
- Broad competitor scraping via IG.

## Reddit (added 2026-07-14, Codex guidance)
- Reddit Pro Trends — IMMEDIATE, no-code, weekly: topic discovery, audience
  wording, recurring questions, controversy signals. Track: unexplained
  sound, ocean mystery, historical mystery, strange survival, psychological
  phenomenon, disturbing science, mystery finally solved, impossible
  coincidence. ALL findings PROVISIONAL until verified against primary
  sources (NOAA/NASA/papers/archives) before scripting.
- Reddit Data API — DEFERRED until manual Pro research is a real bottleneck
  AND Reddit confirms the commercial/internal-analytics use. Constraints if
  ever wired: OAuth, 100 QPM, delete stored user content within ~48h of
  user deletion, NO ingestion as permanent training data, no scraping.
