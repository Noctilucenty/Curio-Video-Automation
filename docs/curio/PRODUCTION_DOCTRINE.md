# Production doctrine (LOCKED) + final-video QA (MANDATORY)

Distilled from REP-2 Dead Water's four review rounds (2026-07-13/14). These are
**production-quality lessons**: the defects they prevent are objectively wrong
(a broken matte or false silence is a bug, not a taste question), so they lock
immediately — unlike retention/tension hypotheses, which stay PROVISIONAL in
VIRAL_PLAYBOOK.md until REP-1/2/3 publish and their analytics are compared.

Every session doing production work reads this file BEFORE building. Every
master runs `node tools/finalqa.mjs <mp4>` BEFORE going to review. No exceptions.

## Doctrine (locked 2026-07-14)

1. **Stock-feasibility check comes first.** Before sourcing, ask per shot: can
   found footage actually show this? Nobody films "full power but not moving"
   or a two-layer water column behind a specific hull. Shots that depict the
   physically impossible or the mechanistically specific must be COMPOSED
   (generated hero footage and/or designed animation) — never approximated
   with contradicting stock. REP-2 v1 failed exactly here: modern vessels
   moving fast under a script about a period ship trapped in place.

2. **One consistent hero asset.** The subject vessel/object appears once,
   from one source. Generate ONE hero clip and cut every subject shot from it;
   carry its traced silhouette into designed shots so diagrams are
   unmistakably the same subject. Interchangeable stock subjects read as
   b-roll soup and kill story coherence.

3. **Designed shots must carry the production's texture.** Flat vector planes
   next to cinematic footage break immersion. Diagrams need the hero's
   silhouette, comparable grain/lighting, ambient particles/light, and motion.
   Cause→effect must be drawn explicitly (the REP-2 propeller pulses feeding
   the wave), not implied.

4. **Alpha mattes are validated, never assumed.** Luma keys on dark-on-dark
   footage WILL capture background rectangles. Validate the mask by
   row/column-profile (find where the solid band begins), cut at a structural
   boundary (deck line), feather the edge, and never retain both a
   photographic and a drawn copy of the same structure. Look at the composite
   at full res before shipping.

5. **Soft light only.** Any full-frame "flare"/glow effect is a radial or
   feathered gradient — a rectangle fill with visible edges is the same
   defect class as a broken matte (REP-2 v3.1 caught its own).

6. **Loop continuity is engineered, then measured.** End on the exact opening
   source frame (bake the crossfade INTO the final clip and verify that clip
   in isolation — big-graph xfades can silently no-op on concat timestamp
   jitter). Branding/footers must be fully gone before the crossfade
   completes. Verify endpoint similarity grain-aware: raw SSIM will sit near
   the grain floor (~0.95 for identical content); blurred SSIM must be high
   and a side-by-side eyeball check is part of QA.

7. **Loudness targets apply to the FINAL COMBINED MIX** (voice+bed+fx):
   ≈−17 LUFS integrated, true peak ≤ −1.5 dBTP, voice clarity preserved.
   Never normalize a bed alone to the target.

8. **Silence is verified acoustically, never assumed from word timestamps.**
   Whisper word boundaries stretch across SSML pauses (REP-2: "it" reported
   ending 0.5s late; the reveal word landed 0.53s after the transcript said).
   Place silence beats and sync-critical shot boundaries from
   `silencedetect`/waveform truth on the actual narration file, then verify
   the FINAL MUX contains the intended interval below −35 dB.

9. **Narration first, retime to measured truth.** Generate the voice, measure
   real duration and real sentence onsets, and retime the shot plan to it.
   Word-count estimates are estimates.

10. **Every asset enters the license log at acquisition time** (source URL,
    asset id, license, AI-generated flag). No log entry, no timeline.

11. **Transcript-verify every TTS take before building on it.** ElevenLabs
    multilingual can silently emit seconds of gibberish syllables on an
    otherwise-200 response (REP-2 rev 4: an em-dash triggered ~3s of mumbled
    non-words; whisper transcript caught it, the waveform alone did not).
    Avoid em-dashes in TTS text (use ellipsis or a period). Also: SSML
    `<break>` times COMPOUND with the voice's natural sentence pauses —
    measure the take and keep every unengineered gap short enough that no
    silence-trimming pass is ever needed (REP-2 rev 4: asked 0.3s, got 0.61s;
    fixed by requesting 0.15s and letting punctuation do the rest).

12. **Pacing is measured two ways, and a gap is only dead air if BOTH agree.**
    Whisper word-timestamp deltas overstate gaps (breath and voiced delivery
    live inside them: REP-2 rev 5's 0.48s "turned→looped" gap contained
    −17 dB speech — cutting it mangled "looped" into "hooped"); a single
    silencedetect threshold understates them (breathy gaps ride above −32 dB).
    Audit BOTH: word-gap deltas for perceived pacing, energy probes
    (silencedetect −38 dB + windowed volumedetect) for what is actually
    cuttable. Surgical trims happen only inside measured true-silence spans,
    cut from the middle, with ~10 ms crossfades — then re-transcribe to prove
    no word was damaged.

## Final-video QA checklist (run on every master, before every review)

Automated by `tools/finalqa.mjs` (deterministic, no LLM):
- [ ] Container: 1080×1920, 30fps, duration in spec (12–25s), audio stream present
- [ ] Loudness: integrated −17.1 ±1.5 LUFS; true peak ≤ −1.5 dBTP (report LRA)
- [ ] Silence beat: ≥0.35s below −35 dB somewhere in the 50–95% region
- [ ] No black frames (blackdetect)
- [ ] Loop endpoints: first vs last frame SSIM raw + blurred, both reported;
      blurred ≥ 0.90 required
- [ ] Contact sheet emitted (8 frames)

Human/vision checks (the script emits the artifacts; a person signs off):
- [ ] Contact sheet at MOBILE size: every beat readable, no dead-black beats
- [ ] Full-res spot frames: no rectangular mattes, no double structures,
      no hard-edged light
- [ ] Endpoint side-by-side: loop reads seamless to the eye
- [ ] Script-to-shot audit: every narration line is shown, not contradicted

## What stays PROVISIONAL (do NOT lock)

Tension progression, reveal-at-75%, loop-ending effectiveness, atmospheric
survival-mystery archetype — all await REP-1/2/3 published analytics. A video
can pass every check above and still perform poorly. When the fifth
performance-labeled video lands, run `POST /api/learning/run` and promote only
what the numbers support.
