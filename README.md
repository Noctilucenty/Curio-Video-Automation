# Curio Automation

Automated short-form video factory for Curio.

**OpenAI = brain · HeyGen = renderer · this DB = memory + learning loop · platform analytics = feedback signal.**

HeyGen never decides content quality. OpenAI controls the hook, script, caption rhythm,
pre-publish scoring, and the weekly learning analysis; HeyGen only turns an approved
script into an avatar MP4.

## The loop

```
topic ──► OpenAI: full video package        (hooks ×5, script, timed captions,
              │                              scene direction, title, post copy)
              ▼
        OpenAI judge: score 0–10            hook ≥8 · captions ≥8 · brand ≥8
              │  fail → rewrite w/ feedback (max 2 auto-regens)   viral ≥7 · safety ≥8
              ▼  pass
        HeyGen render (1080×1920 mp4)
              ▼
        review queue  ── you approve / reject / edit / regenerate
              ▼
        published → ingest analytics → weekly learning run
              ▼
        new prompt_rules injected into every future generation
```

Nothing auto-posts. Humans approve; the judge only gates the automated loop.

## Run it

```bash
npm install
cp .env.example .env       # fill keys, or leave empty for full mock mode
npm run dev                # http://localhost:8790  (review dashboard at /)
npm test                   # 42 tests, all offline
```

With **no keys set**, both providers run in deterministic mock mode: the mock
generator writes Curio-voice packages and the mock judge actually applies the
rubric (banned phrases, caption word counts, hook length), so the entire
pipeline — including the fail→rewrite loop — works end-to-end offline.

## Env vars

| var | purpose |
| --- | --- |
| `OPENAI_API_KEY` | real script/judge/learning generation (empty = mock) |
| `OPENAI_MODEL` | default `gpt-5-mini` (hard rule: never downgrade to 4o-mini) |
| `HEYGEN_API_KEY` | real avatar rendering (empty = mock) |
| `HEYGEN_AVATAR_ID` / `HEYGEN_VOICE_ID` | which avatar speaks |
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
2. Create a HeyGen API key + pick avatar/voice ids → real MP4s in the review queue.
3. Post approved videos manually, hit *Mark published*, paste analytics weekly.
4. After each analytics batch, hit *Run learning analysis* — the next batch obeys
   the new rules.
