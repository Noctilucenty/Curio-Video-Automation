# AUTOMATION CONTROL PLANE

> How the one-click Autopilot works, what it deliberately will not do, and the exact
> steps + credentials required to deploy it on Render.
> **Engineering facts only.** Nothing here promotes a creative rule into doctrine.

## The shape

```
browser ──POST /api/autopilot/runs──> WEB (Express)
                                       │  writes run + stages to Postgres
                                       │  enqueues {runId} to BullMQ (Render Key Value)
                                       └─ returns 202 in milliseconds
                                              │
                          WORKER (separate Render service, same image)
                                              │  claims ONE stage under a lease
                                              │  heartbeats; checkpoints to Postgres
                                              └─ SSE log ← browser reads /events
```

**The web service never generates.** A production takes minutes and spends money; if it
ran inside the request, a Render deploy or a closed tab would abandon it mid-spend.

## Why each piece exists

| Piece | Why not the simpler thing |
|---|---|
| Separate worker | The in-process `JobQueue` loses every job on restart, and Render restarts on each deploy. |
| BullMQ + Key Value | Durable, retryable, and `jobId = runId` gives free dedupe. Key Value **must** be `noeviction` — under any eviction policy Redis can drop job keys under memory pressure and silently lose runs. |
| Postgres as truth | Queue payloads carry IDs only. Wipe Redis and runs are still recoverable. |
| Stage leases | Two workers must never run one stage — that would double-spend. A lease + heartbeat means a crashed worker's stage becomes claimable again after TTL, and no sooner. |
| `provider_calls.dedupe_key` UNIQUE | The actual duplicate-spend guard. On resume the key already exists, so the recorded result is reused instead of re-calling the provider. |
| Object storage | Render's filesystem is ephemeral. Masters written to disk vanish on deploy. |

## State machine

`QUEUED →` 17 stages `→ READY_FOR_REVIEW`

`LOADING_CANONICAL_CONTEXT · DISCOVERING_TOPICS · SCORING_TOPICS · FACT_CHECKING ·
SCRIPTING · SCRIPT_SELF_REVIEW · GENERATING_NARRATION · NARRATION_QA ·
BUILDING_AUDIO_STORY · AUDIO_LOOP_QA · PLANNING_VISUALS ·
SOURCING_OR_GENERATING_VISUALS · ASSEMBLING · CREATIVE_SELF_REVIEW · CORRECTING ·
CAPTIONING · FINAL_QA`

Interruption states: `PAUSED · CANCELLED · FAILED · BLOCKED_CREDENTIAL ·
BLOCKED_BUDGET · BLOCKED_LICENSE · BLOCKED_CAPTIONS_AUTH`

`CORRECTING` is conditional — the creative self-review decides. A **blocked** run keeps
every completed stage and resumes from the blocker once the human clears the cause;
a **failed** run does not.

## Money

Every paid call goes through `ctx.spend()`, which:
1. refuses in dry-run (structural, not a convention inside provider code),
2. refuses if projected total > run budget → `BLOCKED_BUDGET`,
3. dedupes on a key → a restart never re-bills,
4. records the provider's own operation id **before** the result exists, so a crash
   mid-poll can be reconciled rather than re-submitted.

`GET /api/autopilot/runs/:id/costs` is the ledger.

## What it will NOT do

- **Never posts.** There is no publish path in the autopilot surface at all.
- **Never claims a tool it did not use.** If Captions.ai cannot be driven, the run parks
  in `BLOCKED_CAPTIONS_AUTH` rather than silently substituting the local caption engine.
- **Veo is OFF by default**, and `maxVideoCalls` is forced to 0 unless `allowVeo` is
  explicitly set — the browser cannot escalate this by editing the payload.

## Captions.ai — verified capability, 2026-07-20

**The public API is degraded.** `POST https://api.captions.ai/api/edit/submit` returns
**502 even with an invalid key** — it fails *before* auth, so the service is down, not
our credentials. This matches the note in `src/postprocess.ts` from 2026-07-14.

What the API *would* support if it returns:
- ✅ auto-trim OFF (`removeFillerWords:false, removeSilences:false`)
- ✅ **caption grouping** — it accepts our SRT **verbatim**, so sentence-aligned cards,
  page breaks and "no cross-sentence fragments" are all achievable programmatically
- ❌ **named style templates (e.g. Nova)** — the API takes a custom style object, not a
  template name. Nova specifically is a web-app feature.
- ❌ per-word Break controls

**Therefore the honest position:** the button runs all prior stages unattended and then
parks at `BLOCKED_CAPTIONS_AUTH`. This is not a fake one-button integration, and it is
not presented as one. When the endpoint recovers, `probeCaptionsApi()` detects it at
runtime and the stage proceeds automatically — except for Nova styling, which remains
web-app-only.

## Rendering — RESOLVED (was the macOS-only blocker)

The renderer previously rasterized captions by shelling out to
`xcrun swiftc tools/caption_render.swift`, a file that does `import AppKit`. Neither
exists on Linux, so a Render container could not caption a video at all.

**`tools/caption_render.py` (Pillow) is now the portable rasterizer and the default on
every platform.** It honours the identical `spec.json` contract, so `localRenderer.ts`
only chooses a different executable — nothing else in the ffmpeg composition changed.

Why Pillow rather than ffmpeg `drawtext`:
- PRODUCTION_DOCTRINE already records that the dev machine's ffmpeg has **no
  drawtext/libass** (verified again: 0 drawtext filters), so a drawtext renderer could
  never be tested here — it would ship unverified.
- Pillow exposes exact per-run text metrics, which is what lets the **emphasis word**
  sit correctly inside a proportional line. `drawtext` can only report the width of its
  own single instance, so mixed-weight lines would have to be positioned by guesswork.

Selection order (`resolveCaptionRasterizer`):
1. `CAPTION_RASTERIZER=python|swift` forces the choice.
2. Otherwise **python**, everywhere.
3. Swift is used only if Pillow is genuinely unavailable **and** the host is macOS —
   never as a silent Linux fallback, where it cannot work and a clear error is far more
   useful than a confusing `xcrun` failure.

Swift therefore remains an **optional macOS-local adapter** (it reproduces the exact
typography earlier masters were cut with), not a requirement.

**Verified end-to-end on the Linux path** (`CAPTION_RASTERIZER=python`, real ffmpeg):
a narrated render produced **1080x1920, 192 frames, 6.400s**, and the card-mode render
test passes through the same path. The Docker image installs `python3` + `python3-pil`
plus DejaVu/Liberation fonts.

Still open (not a rendering blocker): `LocalRenderer` keeps render state in
process-local `Map`s, so a render begun in one process cannot be polled from another.
That must move into the store before renders are distributed across multiple workers.

## Security

**Private by default.** Everything — every `/api` route including GETs, `/videos/*`,
artifacts and the SSE stream — requires a credential. The previous model left all GETs
and all rendered MP4s world-readable; that is fixed.

| Control | Implementation |
|---|---|
| Login | `POST /api/auth/login` → HttpOnly + Secure + SameSite=Strict session cookie. Stateless HMAC, so a restart or a second web instance doesn't log you out. |
| Logout | `POST /api/auth/logout` clears both cookies. |
| Browser storage | **None.** The admin token no longer touches JS or `localStorage` — an XSS there would have leaked permanent access. JS only reads the CSRF token, which is useless without the HttpOnly session cookie. |
| CSRF | Double-submit token (`x-curio-csrf`) **plus** Origin/Referer validation on every mutation. Bearer-authenticated calls are exempt — browsers never attach bearer tokens automatically, so there is no forgery vector. |
| Rate limits | Login 10 / 15 min / IP. Generation and autopilot runs 30 / hour. |
| Headers | CSP (`frame-ancestors 'none'`, `base-uri 'none'`), nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS in production. |
| Artifacts | Session **or** a signed URL that expires in **5 minutes** (`GET /api/media/sign`). A leaked link stops working. |
| Secret comparison | Constant-time everywhere. The old bearer check used `===`, which leaks under timing analysis. |
| Boot guard — FAIL CLOSED | `NODE_ENV=production` **requires both `ADMIN_PASSWORD` and `SESSION_SECRET`**; startup aborts naming exactly what is missing. An `ADMIN_TOKEN` alone is NOT sufficient (a bearer token cannot sign a human into the dashboard). A `SESSION_SECRET` under 32 chars, or `ALLOW_INSECURE_NO_AUTH` set, also abort. Credential-less/public mode is possible only outside production. |

Provider keys are never sent to the browser. `x-forwarded-for` is trusted only for its
first hop; later entries are attacker-controlled.

## Deployment

```bash
render blueprint launch          # or: connect the repo in the Render dashboard
psql "$DATABASE_URL" -f db/migrations/001_autopilot.sql
```

Health: `GET /healthz` (web). Worker readiness is its boot log line.

### Required secrets

| Variable | Where | Status on this machine |
|---|---|---|
| `RENDER_API_KEY` | Render | **MISSING** — blocks deploy |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 or S3 | **MISSING** — blocks artifact storage |
| `ADMIN_PASSWORD` | you choose | **MISSING** |
| `SESSION_SECRET` | auto-generated by Render | — |
| `DATABASE_URL` / `REDIS_URL` | auto-wired by the Blueprint | — |
| `OPENAI_API_KEY` | OpenAI | present locally |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | ElevenLabs | present locally |
| `GEMINI_API_KEY` | Google AI Studio | present locally |
| `YOUTUBE_API_KEY` | Google Cloud | present locally |
| `CAPTIONS_API_KEY` | Captions.ai | **MISSING** (and API is 502) |

### Recovery

- **Worker died mid-stage** → the lease expires, another worker reclaims and resumes
  from the last completed stage. No re-spend.
- **Redis wiped** → runs survive in Postgres. `POST /runs/:id/retry-stage` re-enqueues.
- **Deploy during a run** → SIGTERM drains; the in-flight stage checkpoints; the new
  worker resumes.
- **Stuck run** → `POST /runs/:id/cancel`.

## Cost control

Set `maxSpendUsd` per run (hard-clamped server-side to ≤ $100 regardless of payload).
Dry-run never invokes a paid API. There are no hidden retries: every attempt is a row in
`provider_calls`.
