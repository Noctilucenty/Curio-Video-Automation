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

---

## Durable render state (architecture pass, 2026-07-20)

### The defect

`LocalRenderer` kept render status in a process-local `Map`. On Render, WEB and WORKER
are separate processes and workers restart on every deploy, so that Map was not a
limitation — it was a guarantee of two failures:

1. A render started by the worker could **never** be polled by the web service. The
   dashboard would poll forever for a job that was, in another process, already done.
2. A deploy mid-render lost the job entirely, and the retry re-rendered work that had
   already been paid for.

### The fix

`render_jobs` (migration `002`) is the single source of truth: id, idempotency key,
run/stage, status, attempt, lease owner + expiry, heartbeat, progress, input hashes,
output URI + SHA-256 + bytes, ffprobe/QA evidence, error/retry metadata, timestamps.

Three invariants carry the weight:

- **`claim` is one statement guarded by `status <> 'completed'`.** This is what makes
  "never render the same thing twice" structural rather than conventional. A restarted
  worker cannot claim a finished job even if the queue redelivers the message.
- **`idempotency_key` is UNIQUE.** Recomputed from the inputs that determine the output,
  so a crash-retry finds the existing completed row and reuses the artifact.
- **Upload precedes completion.** The artifact goes to object storage first; only then
  is the row marked completed. Completing first would leave a `completed` row pointing
  at a file that dies with the container — a durable record of a vanished artifact.

`MemoryRenderStore` still exists, but only as the explicit dev/test adapter, and
`makeRenderStore` now **throws** in production rather than silently degrading to it.
Same for object storage: production refuses to boot on container-local artifacts unless
`ALLOW_EPHEMERAL_ARTIFACTS=1` says the loss is knowingly accepted.

### Findings worth keeping

**P-51 — A green test against the wrong engine proves nothing.** The six required
durability scenarios passed against the memory adapter while the Postgres SQL had never
once executed. Running the *same contract* against a real PostgreSQL engine (PGlite,
in-process WASM, real migrations) is what turned "it typechecks" into "it runs." Method
generalizes: when there are two adapters, write one contract and run it against both.

**P-52 — A test harness bug looks exactly like a passing product.** The PGlite shim
reported `rowCount: rows.length`, which is 0 for any UPDATE without RETURNING, so
`reclaimExpired()` appeared to reclaim nothing. Had the assertion been `toBe(0)` — the
"observed" value — a broken lease reclaim would have been frozen into the suite as
correct. Assert the behaviour you *require*, then explain any gap; never rewrite the
expectation to match what you saw.

**P-53 — Sanitizing a path is weaker than rejecting it.** Stripping `..` from an object
key silently maps `../x` and `x` onto the same object: a traversal fix that quietly
becomes an artifact-corruption bug. Reject malformed keys.

**P-54 — Fail closed on durability, not just on auth.** The original
`makeRenderStore` logged an error and returned the memory store when Postgres was
unreachable. That converts a loud outage into silent data loss on the next deploy.
Booting is not the goal; booting *correctly* is.

**P-55 — Three of this pass's four "failures" were the harness, not the product.**
A wrong dist path, a `rowCount`/`affectedRows` mismatch, and — the subtle one — zsh not
word-splitting unquoted `$VARS`, so `env $B1 node server.js` set `NODE_ENV` to the
literal string `"production PORT=0 ADMIN_PASSWORD=..."`. Every fail-closed guard
therefore looked dead when all of them worked. Rule: when a verification fails, prove
the harness observed the right thing *before* touching the product. A red test is a
claim about the test as much as about the code.

### Honest gaps

- **Docker image: unverified locally.** Not built on this machine.
- **Captions.ai: `BLOCKED_CAPTIONS_AUTH`.** External 502, reproduced with an invalid
  key, so it fails before auth — service-side, not credentials.
- **S3 signature: unverified against a real bucket.** SigV4 is exercised against a local
  HTTP server (bytes, headers, determinism, error handling), but no AWS/R2 endpoint has
  ever accepted it. First real upload is the test that matters.
- **Worker does not yet render.** The autopilot worker's assemble stage does not
  construct a `LocalRenderer`; the durable store is wired through `server.ts`. The
  cross-process guarantees are in place *for when it does*, and are tested, but the
  worker-side render path is not yet exercised end to end.
- **Object-storage boot guard: unit-tested, not boot-tested.** In production the
  `DATABASE_URL` guard fires before it, so a full-boot check of the storage guard needs
  a live Postgres. Verified by unit test instead; the ordering is intentional.
- **A successful production boot has never happened locally.** No Postgres *server* is
  installed here (PGlite is in-process and cannot serve `pg`). The fail-closed paths are
  verified; the happy path is not.
