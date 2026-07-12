# Curio Automation

Automated short-form video factory for Curio.

**OpenAI = brain · ElevenLabs = voice · local ffmpeg = renderer ·
this DB = memory + learning loop · platform analytics = feedback signal.**

OpenAI (`gpt-5.6`, reasoning routed per task) controls the hook, script, caption
rhythm, fact-checking, pre-publish scoring, and the learning analysis;
ElevenLabs narrates (documentary-narrator voice, settings pinned in `src/voice.ts`);
the LOCAL renderer composites and burns captions itself and enforces a loudness
gate on every output. HeyGen (avatar path) is dormant behind `RENDERER=heygen`;
Captions.ai post-processing is parked — a verbatim TTS read has no fillers or
silences to cut.

## The loop

```
topic ──► OpenAI: full video package        (hooks ×5, script, timed captions,
              │                              scene direction, title, post copy)
              ▼
        fact-check gate                     contested-claims screen (code, free)
              │  fail → rewrite w/ feedback + LLM factuality pass (xhigh reasoning)
              ▼  pass
        OpenAI judge: score 0–10            hook ≥8 · captions ≥8 · brand ≥8
              │  fail → rewrite w/ feedback (max 2 auto-regens)   viral ≥7 · safety ≥8
              ▼  pass
        ElevenLabs narration (mp3) ──► local ffmpeg render (1080×1920, captions burned)
              ▼
        loudness gate                       −16 LUFS target; hard-fail outside
              ▼                             [−20,−12] LUFS or true peak > −0.9 dBTP
        review queue  ── you approve / reject / edit / regenerate
              ▼
        published → ingest analytics (IG/FB SEPARATED) → learning run
              ▼
        new prompt_rules injected into every future generation
```

Nothing auto-posts. Humans approve; the judge only gates the automated loop.
A voice failure falls back to HeyGen TTS (flagged on the card); a Captions.ai
failure leaves the raw render reviewable with a one-click retry
(`POST /api/videos/:id/postprocess`).

## The narration voice

Create/pick the `ELEVENLABS_VOICE_ID` in ElevenLabs using the brief in
`src/voice.ts` (`VOICE_DIRECTION`): young male short-form documentary narrator,
deep/clear/slightly compressed, fast + sharply articulated, urgency into build,
pause before twists, heavier final reveal — not a copy of any identifiable creator.
Delivery settings are pinned (`VOICE_SETTINGS`): stability 0.45, similarity 0.70,
style 0.20, speaker boost on, speed 1.08×. The script generator writes for this
delivery (ellipsis before twists, shortest-heaviest final line, key word last).

## Run it

```bash
npm install
cp .env.example .env       # fill keys, or leave empty for full mock mode
npm run dev                # http://localhost:8790  (review dashboard at /)
npm test                   # full suite, offline (renderer tests need ffmpeg + swiftc)
```

With **no keys set**, both providers run in deterministic mock mode: the mock
generator writes Curio-voice packages and the mock judge actually applies the
rubric (banned phrases, caption word counts, hook length), so the entire
pipeline — including the fail→rewrite loop — works end-to-end offline.

## Env vars

| var | purpose |
| --- | --- |
| `OPENAI_API_KEY` | real script/judge/learning generation (empty = mock) |
| `OPENAI_MODEL` | default `gpt-5.6` (newest flagship alias; hard rule: never mini/nano; pin a snapshot id during A/B cohorts) |
| `CARDS_FROZEN` | default frozen — card topics/generation return 403; set `0` to unfreeze deliberately |
| `ELEVENLABS_API_KEY` | real narration (empty = mock voice) |
| `ELEVENLABS_VOICE_ID` | the documentary-narrator voice (see `VOICE_DIRECTION`) |
| `ELEVENLABS_MODEL` | default `eleven_multilingual_v2` |
| `HEYGEN_API_KEY` | real avatar rendering (empty = mock) |
| `HEYGEN_AVATAR_ID` / `HEYGEN_VOICE_ID` | avatar id; voice id is only the TTS fallback |
| `CAPTIONS_API_KEY` | Captions.ai post-processing (empty = mock passthrough) |
| `CAPTIONS_API_BASE` | only if your account docs show a different API base |
| `ADMIN_TOKEN` | when set, all POSTs need `Authorization: Bearer <token>` |
| `PORT` / `DATA_DIR` | server port, JSON snapshot location |

## API

```
POST /api/video-topics            create a topic (topic, category, target_platform, tone, …)
GET  /api/video-topics
POST /api/videos/generate         {topic_id} or inline topic — returns 202 + video_id
GET  /api/videos[?status=]        GET /api/videos/:id[?include=generations]
GET  /api/videos/:id/captions.srt
POST /api/videos/:id/regenerate   back through the pipeline (judge feedback carried)
POST /api/videos/:id/edit         manual hook/script/caption_lines — re-judged + re-rendered
POST /api/videos/:id/approve      ready_for_review → approved
POST /api/videos/:id/reject       … → rejected ({reason})
POST /api/videos/:id/publish      approved → published (you post manually, then mark)
POST /api/videos/:id/postprocess  retry the Captions.ai step against the existing render
POST /api/videos/:id/performance  ingest analytics (views, completion_rate, saves, …)
POST /api/learning/run            analyze top/bottom 20% → new prompt rules
GET  /api/learning/rules          GET /api/learning/runs
GET  /api/review-queue            GET /api/jobs · GET /api/meta · GET /healthz
```

Statuses: `draft → generated → (needs_revision ⇄) → ready_for_review → approved → published`,
plus `rejected` / `failed`. Illegal transitions return **409** — the queue can't be
driven into a nonsense state.

## Design decisions

- **Prompt versioning**: every OpenAI call (package, judge, learning) is stored with
  its prompt version, model, full input and output — the A/B trail, and the future
  fine-tuning dataset. **Do not fine-tune yet**: improvement flows through
  `learning_rules` + examples until ~300+ performance-labeled winners exist.
- **Captions are enforced, not requested**: a validator + normalizer guarantees
  ≤7 words/line, one emphasis phrase per beat, sequential timing — model drift gets
  repaired or rejected before it ships. Style contract in `src/captions.ts`
  (`curio_premium`: cream type, emphasis via weight/scale — never loud color —
  safe-area aware).
- **Launch-brief voice baked in**: hook must reveal the full mystery in line one,
  12–16s default length, escalation beats (evidence → twist → payoff), soft Curio
  signature endings, review-safe CTAs (no "download now" while App Store review
  is pending), banned openers auto-fail the judge.
- **Learning runs supersede each other**: seed + manual rules persist; each weekly
  run deactivates the previous run's rules and installs its own. Needs ≥5 videos
  with metrics.
- **Storage**: JSON snapshot (`data/automation.json`) for dev; `db/schema.sql` is the
  Postgres/Supabase contract for the production adapter. Repo interface is async
  everywhere so the swap touches no callers.
- **Queue**: in-process serialized worker, BullMQ-shaped interface (named jobs) so a
  Redis swap is mechanical when volume demands it.
- **Analytics**: manual JSON ingestion first (`POST /performance`); platform APIs later.

## Going live

1. Put `OPENAI_API_KEY` in `.env` → real scripts immediately.
2. Design the narrator voice in ElevenLabs from `VOICE_DIRECTION`, set
   `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`.
3. Create a HeyGen API key + pick the avatar id → avatar lip-syncs the narration.
4. Set `CAPTIONS_API_KEY` → captions burned in `curio_premium`, fillers and
   silences cut automatically. (Endpoint paths are centralized at the top of
   `src/postprocess.ts` — align them with your account's API docs if they differ.)
5. Post approved videos manually (publish `final_video_url`), hit *Mark published*,
   paste analytics weekly.
6. After each analytics batch, hit *Run learning analysis* — the next batch obeys
   the new rules.
