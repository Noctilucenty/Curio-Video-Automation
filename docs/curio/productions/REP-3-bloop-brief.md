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

STATUS: awaiting Codex FINAL verdict on REP-3-pre-captions-master-v2.mp4
(+ rep3-v2-calving-mobile.mp4 / rep3-v2-dread-mobile.mp4 motion clips).
Do not enter Captions.ai. Caption beats (approved, for the Captions pass):
THE SAME SOUND./3,000 KM APART. · ONE OF THE/LOUDEST EVER RECORDED. ·
NO ONE KNEW/WHAT MADE IT. · SOMETHING ENORMOUS? · THE BLOOP/WASN'T ALIVE. ·
ANTARCTIC ICE/CRACKING APART.
