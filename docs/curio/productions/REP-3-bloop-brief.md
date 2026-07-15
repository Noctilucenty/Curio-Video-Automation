# REP-3 — THE BLOOP (pre-Captions master v1, 2026-07-14)

Directive: REP-2 stopped and preserved as R&D (unpublished, lessons retained
per component). REP-3 = one complete, clean, source-backed mystery video;
max one correction pass after Codex review.

## Approved script (final, verbatim in narration)
"In 1997, underwater microphones more than 3,000 kilometers apart caught the
same sound. It was one of the loudest ever recorded underwater, and no one
knew what made it. People imagined something enormous in the deep. But the
Bloop wasn't alive. NOAA traced it to Antarctica: an iceberg cracking apart
underwater."

## Sources (captures saved next to the master)
- NOAA Ocean Service Bloop overview (1997; hydrophones >3,219 km apart;
  icequake — iceberg cracking off an Antarctic glacier)
- NOAA PMEL icequakes/Bloop page (recording sped up 16x; icequake spectral
  match; >5000 km detection range)
- OFFICIAL AUDIO USED (both U.S. Government public domain): PMEL bloop.wav
  (16x) at frame zero + as recurring motif; PMEL iceberg-calving recording
  (3x) as the payoff crack. Full claim map in asset-license-log.json.

## Structure (540f / 18.0s / 9 beats)
pulse-open (Bloop at sample one; luminous pressure swell in the abyss, no
rings/UI; faint anomaly glow present at both loop endpoints) → hydrophone A
→ hydrophone B (mirrored; same-signal repeat) → night Pacific from orbit
(distance scale, no map lines) → abyss descent → ambiguous enormous mass
(speculation only, no anatomy) → Antarctic shelf aerial → iceberg calving
payoff (largest, clearest, brightest beat) → close pulse = loop (SSIM .977).

Sound collapse (0.8s true silence) sits after "NOAA traced it to
Antarctica", before the crack + final sentence — the narration's only honest
gap (take split at the sentence boundary, +0.5s, zero wording changes).
JUDGMENT CALL vs the outline's collapse-before-"wasn't alive" — flagged.

## Verification
- finalqa ALL PASS first run: −17.5 LUFS (±1.5 window), TP −2.9, LRA 2.5,
  silence 14.81s/0.65s, no black, loop 0.977, 1080x1920/30fps/18.00s.
- faststart; ffprobe + full decode after encoder exit; muxed transcript
  persisted, word-perfect (spoken NOAA = whisper homophone "Noah", noted;
  all written materials use NOAA); caption-band overlay proof saved
  (essential evidence above the Flair band); mobile contact sheet emitted.
- Narration audition: v1 excluded (spoken deviation "was not"), v3 (speed
  1.0) added no real breathing room; v2 chosen (verbatim, pinned settings,
  0.20-0.36s sentence pauses). Peak RSS 486MB, sequential, ≤2 threads.

## Ledger
LOCKED: official-source audio pipeline; fact→source claim map;
integrity chain; caption proof; audition-before-use.
PROVISIONAL (await 24h/72h/7d Curio analytics): frame-zero real-audio hook,
motif recurrence, collapse placement, darkness budget, single-beat
speculation, 9-beat pacing.
REJECTED: lit expanding wavefront (sonar-bullseye read) — bloom+refraction
only.

STATUS v1: Codex verdict 6/10 — one correction pass required. Static
zoompan climax REJECTED (crack had no visual cause); ~6s dark middle
REJECTED (insufficiently evolving). Script/narration/mix/structure praised
and preserved.

## v2 correction pass (2026-07-14)
- Calving payoff = one-off Veo 3.1 generation (authorized; not wiring):
  stressed wall → fracture → slab accelerating → spray eruption, speed-
  ramped so the fracture onset lands exactly on the 15.45s crack; dusk-navy
  graded; Veo audio discarded. The crack now has an obvious visual cause.
- Dread section rebuilt with continuous development: 3-layer parallax
  marine snow, narrowing/dimming light column, distant crossing shadow,
  laterally sweeping god-light, and the enormous mass visibly moving and
  swelling. Validated as PLAYABLE compressed 270x480 clips (doctrine 24),
  not stills.
- All else verbatim. finalqa ALL PASS again (identical audio figures);
  muxed transcript identical to v1; caption proof v2 clean; peak RSS
  <450MB. Veo one-off recorded in the license log.

STATUS v2: Codex HOLD — Veo calving, crack sync, audio preservation (v1/v2
audio SHA-256 identical), caption safety and technical QA ACCEPTED and
LOCKED. Two defects blocked GO → surgical acceptance patch (v2.1).

## v2.1 surgical acceptance patch (2026-07-14)

Two defects, nothing else. No new assets, no script rewrite, no mix redesign,
no shot changes, no API wiring.

1. **The enormous mass now reads at 270x480** (Codex: "only a vague patch").
   Root cause, and the reusable lesson (→ doctrine 26/27): the mass was a
   multiplicative occluder over an abyss plate already at luma ~11/255.
   Darkening 11 gives 7 — a **3.4 gray-level** delta that x264 erases at
   mobile size. *You cannot darken near-black.* The fix lights the water
   BEHIND the body: the existing god-light scatters in the haze around and
   above it (asymmetric — weighted toward the beam, dying below, so it can
   never close into a ring, which was v1's rejected sonar-bullseye read), the
   body is carved deeper, and a restrained crescent catches the lit upper
   edge. No global brightening. Ambiguity intact — still one blurred ellipse:
   no anatomy, eyes, fins, tentacles, rings or UI. Same fix on the descent
   pre-echo shadow.
   OBJECTIVE GATE (new — tools/rep3_massqa.py, measured on the compressed
   270x480 clip cut from the DELIVERED master, never the 1080p render):
   core 15.4 / surround 30.0 / **delta 14.4 median, min 12.8, 80 of 80
   frames** (v2 = 3.4). Mass travels 100px x / 45px y on a 270-wide frame.

2. **Unsupported final word "underwater" cut** (fact correction). NOAA/PMEL
   say an iceberg cracked and broke away from an Antarctic glacier; neither
   says the fracture happened underwater — the sound was *recorded*
   underwater, a different claim (→ doctrine 29: audit every modifier, not
   just the claim). Ending is now "...NOAA traced it to Antarctica: an
   iceberg cracking apart." Done as a clean WAVEFORM edit of the existing
   narration v2 take — no TTS regeneration (→ doctrine 30) — cut at the
   15.695s energy floor between "apart" and "underwater". The two other uses
   of "underwater" (underwater microphones; loudest ever recorded underwater)
   ARE sourced and are unchanged. Freed tail is not refilled: the bed duck
   closes with the narration so the closing Bloop pulse rings exposed into
   the loop. License-log claim map corrected.

QA: finalqa ALL PASS first run (18.00s, 540f, I -17.8 LUFS, TP -3.1, LRA 2.5,
silence 14.81s/0.65s, no black, loop blurred SSIM 0.976); mix re-measured
honestly (raw -15.31 → linear gain -2.19 dB → -17.50 LUFS, no compression);
faststart + full decode after encoder exit; muxed transcript ends "An iceberg
cracking apart."; caption proof clean (mass's lit crown above the band);
motion validated as playable clips from the delivered master.

## STATUS: CODEX GO (2026-07-14) — first master in this cycle advanced

Codex independently confirmed on v2.1: the mass is visible at 270×480 and
progressively enters the composition; it stays ambiguous (no anatomy); the Veo
fracture visibly causes the audio payoff; the unsupported "underwater" is gone;
the transcript ends "An iceberg cracking apart."; caption-safe framing, technical
QA, loop, loudness and factual structure all pass. → **Captions.ai, captions only.**

### Captions gate — AUTOMATED via API (manual-app instruction withdrawn 2026-07-14)

Full spec: `data/productions/REP-3/CAPTIONS-SPEC-v2.1.md`. Reusable capability:
`docs/curio/profiles/locked_master_retention_captions.json` + `src/postprocess.ts`.

Timeline policy = `locked_master`: captions ONLY, trimming structurally disabled
(`resolveOperations` forces cutFillers/cutSilences false and rejects any cut
request; the old client's hardcoded `cutFillers/cutSilences: true` is gone).
Import a byte-identical copy (`REP-3-v2.1-FOR-CAPTIONS.mp4`); the master is never
mutated.

**⚠️ Capability blocker (probed 2026-07-14) — REP-3 job NOT yet runnable:**
- Legacy `api.captions.ai/edit/submit` (custom SRT + trim flags) returns **502**
  — degraded/deprecated.
- Live `api.mirage.app/v1/videos/captions` is **auto-transcription only** (a
  `caption_template_id` over audio-generated captions; no custom SRT, no reveal
  timing, no trim flags). Auto-captioning REP-3 would dump the transcript and
  spoil the reveal — the client REFUSES this (`CAPABILITY_BLOCKER`) rather than
  silently falling back.
- No active `CAPTIONS_API_KEY` in `.env` (a rejected key is commented out).

To run: (1) valid Mirage `CAPTIONS_API_KEY` + `MIRAGE_CAPTION_TEMPLATE_ID` in
`.env`; (2) confirm the account exposes custom caption timing → set
`MIRAGE_CUSTOM_CAPTION_TIMING=1`. If the account is auto-caption-only, exact
reveal timing is unavailable (the real blocker) and REP-3 needs the manual path.

Caption track (8 beats, hook split into two screens; "Antarctica" ends 14.66,
silence 14.81–15.46, final sentence resumes 15.69, crack 15.45 inside the gap;
SRT: `data/productions/REP-3/rep3-captions-v2.1.srt`):

| # | Caption | In | Out | Emphasis |
|---|---|---|---|---|
| 1 | THE SAME SOUND. | 0.15 | 2.55 | SAME SOUND |
| 2 | 3,000 KM APART. | 2.55 | 5.75 | 3,000 KM |
| 3 | ONE OF THE / LOUDEST EVER RECORDED. | 6.05 | 7.98 | LOUDEST |
| 4 | NO ONE KNEW / WHAT MADE IT. | 8.15 | 9.40 | NO ONE KNEW |
| 5 | SOMETHING ENORMOUS? | 10.10 | 11.70 | ENORMOUS |
| 6 | THE BLOOP / WASN'T ALIVE. | 11.80 | 14.70 (held through the Antarctica line) | WASN'T ALIVE |
| — | *no caption* | 14.70 | 15.44 (bare — tension) | — |
| 7 | ANTARCTIC ICE / CRACKING APART. | **15.45** | 17.60 | CRACKING APART |

**Reveal rule:** `CRACKING APART` must NEVER appear before 15.45. It lands ON the
crack, not on "NOAA traced it to Antarctica" — that would spoil the payoff. First
caption is up by 0.15s (no dead captionless opening).

Verify the export with `tools/rep3_captions_verify.py <export.mp4>`: checks 18.0s
/540f, silence survives, crack still at 15.45, export audio lag-0 / corr≥0.98 vs
the master (catches any cut/pacing edit/music/re-normalisation), and that the
caption band is empty through the silence with new text at the crack, not before.
Then send BOTH the master and the export to Codex.

### Captions gate ADDENDUM (2026-07-15) — Creatomate path EXECUTED, sandbox PASS

The Mirage capability blocker is moot: per Leon/Codex the captions-only proof
ran on **Creatomate** (`POST /v1/renders`, custom `source` JSON — supplied
exact caption timing, zero transcription). The 8-beat track above was encoded
as absolute-timed text elements (beat 7 hardcoded at 15.45). Verifier FULL
PASS on the export: 18.00s/540f, silence beat intact, crack 15.45s, audio
lag +0ms / corr 0.9983, loudness identical to master, caption band empty
through the silence, first caption pixels at the crack. One caveat: the free
trial forces render_scale 0.25 (270x480 sandbox export); a paid plan renders
the same payload at native 1080x1920. Script:
`data/productions/REP-3/tools/rep3_creatomate_captions.py` (key =
CREATOMATE_API_KEY in .env). Details: production-log.md.
