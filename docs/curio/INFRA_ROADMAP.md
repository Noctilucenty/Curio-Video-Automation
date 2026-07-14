# Curio factory — infrastructure roadmap (locked 2026-07-14, Codex-approved order)

Gate: **REP-3 Codex review finishes first.** No wiring before that verdict.
Rule: do NOT wire overlapping providers in parallel (no Veo+Runway+Luma
comparison loop). One primary per capability; fallbacks stay manual.

Target stack:
`vidIQ + YouTube/TikTok discovery → strongest reasoning model → Veo or
licensed stock → ElevenLabs → ffmpeg/Captions → YouTube/Instagram analytics
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

## 3. Google Veo 3.1 (via Gemini API) — primary video generator
- ONLY for hero shots stock can't provide: impossible historical scenes,
  coherent underwater events, specific physical actions, consistent
  recurring subjects.
- Narration + real source audio stay OUTSIDE generated clips.
- Runway = manual fallback if a specific shot fails. Luma: not wired.
- Docs: ai.google.dev/gemini-api/docs/veo
- LEON PREREQS: Gemini API key with billing enabled.

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
- Runway, Luma as wired providers (manual fallback only).
- Any additional general brainstorming model.
- Broad competitor scraping via IG.
