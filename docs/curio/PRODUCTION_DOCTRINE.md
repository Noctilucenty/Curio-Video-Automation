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

13. **Perceptual consistency: every drawn/diagram version of a real asset must
    match the footage version's visual signatures.** Not "a ship" — THE ship:
    same funnel placement, mast rhythm, deck details, proportions. REP-2 v6's
    simplified black diagram vessel failed the creative gate purely because it
    didn't read as the hero ship. Extract the hero's 3-4 strongest silhouette
    signatures from an actual frame and reproduce them.

14. **Mobile causal legibility: a mechanism's cause and effect must be
    readable at phone size without captions.** The causal chain needs to be
    physically continuous on screen (REP-2 v7: prop → luminous trail →
    boundary → wave step), with the effect placed AT the point of impact —
    v6's discrete near-invisible pulses and a crest growing far from the
    impact point both broke the chain. Verify on frames downscaled to ≤270px
    width, not at full res.

15. **Mute comprehension is a gate, not a hope.** Review the contact sheet
    with the sound off and ask: does each beat add new information, and does
    the mechanism explain itself? Movement inside an unchanged composition is
    NOT a new beat. Count genuinely distinct compositions; claims of
    "N visual changes" must survive a human mute read, not just scdet.

16. **The reveal is the closest, clearest view of the system — never a
    retreat.** Pulling the camera away at the name-landing (v3-v6) weakens the
    payoff exactly when attention peaks. The reveal frame should be the single
    strongest cause-and-effect image in the video.

17. **QA runs on the MUXED deliverable, not the pre-mux stems.** Transcribe
    the final MP4's audio and diff against the locked script (gates and fades
    can damage words after the stems were verified); loudness/silence/LRA are
    re-measured post-AAC. A master is "verified" only in its shipping
    container. Persist that transcript next to the master as proof.

18. **When cinematic footage and diagram artwork stay perceptually
    inconsistent after two review passes, stop polishing the diagram and
    REPLACE THE MEDIUM.** This is architectural, not a parameter. A drawn/
    vector renderer and photographic footage are different media; no amount of
    matte tuning, stroke weight, or palette matching closes a medium gap the
    eye reads instantly (REP-2 v3→v7: four rounds of vector polish, still
    rejected for "vector aesthetic ceiling"). The fix is to generate the
    explanatory shots in the SAME medium as the footage — here, one
    photoreal cross-section plate generated from the hero frame, reused across
    descent/mechanism/reveal via 2.5D camera moves (ffmpeg zoompan), real
    boundary deformation via crossfaded wave-state plates, and physical
    turbulence from stock bubble/foam — so every shot is a photograph.
    Corollary: keep generation prompts describing the DESIRED IMAGE only; do
    not pollute them with this project's rejection history or implementation
    notes — that is production log material, not prompt material.

19. **Compute must fit the hardware.** Per-frame full-resolution work belongs
    in a streaming C tool (ffmpeg), not a Python loop that preloads video
    frames — loading N full-res float32 frames into a list is O(N×25MB) and
    will swap-kill a small machine (REP-2 v8: a 200-frame preload × parallel
    workers froze an 8GB Mac twice). Rules: never preload decoded video; read
    on demand or extract stills first; ONE render process at a time, never
    parallel; cap threads (max 2 on the 8GB machine); prove peak RSS below
    ~750MB on the first beat before scaling, and treat that cap as a HARD
    gate — a 48-frame job that profiled at 798MB gets restructured (segments
    + xfade), not shipped (REP-2 v9). If memory pressure rises mid-render,
    stop; do not retry blindly.

20. **A composition is only distinct if it gives the viewer NEW INFORMATION.**
    scdet counting machine cuts is a floor check, not evidence of visual
    variety — crops and brightness variants of one plate trip the detector
    while teaching nothing (REP-2 v8: "10 compositions" by scdet, rejected
    because several were the same plate re-cropped). Judge each beat by what
    a mute viewer LEARNS from it that the previous beat didn't show; claim
    distinctness on that basis only. Corollary for explanatory sequences:
    the causal chain must be spatially explicit — the cause's output must
    visibly REACH the thing it affects (churn touching the boundary), the
    effect must be a specific physical change (a lateral traveling wave, not
    generic turbulence), and the payoff frame must show the ENTIRE system at
    once, wider and clearer than any frame before it.

21. **A deliverable exists only after it reopens.** After the encoder process
    exits, ffprobe the file AND fully decode it (`ffmpeg -v error -i X -f
    null -`); encode MP4s with `-movflags +faststart` so the moov atom leads
    the file (a tail-moov MP4 truncates into "moov atom not found" for any
    receiver). A successful render command is not proof of a valid file
    (REP-2 v10: preview delivered unplayable). Also verify the frame folder
    holds exactly one numbered sequence — macOS can leave "f0221 2.png"
    duplicates that contaminate later encodes.

22. **Never pixel-warp rigid machinery.** Remapping/rotating photographed
    rigid geometry liquefies it — blades ghost, hubs smear (REP-2 v10).
    Either isolate the moving part onto its own properly-matted layer, or
    keep the photograph rigid and IMPLY motion: specular sweeps that ride
    the structure, cavitation/churn particles, directional blur. Hardware
    geometry must be pixel-identical every frame.

23. **Inspect sprite composites at mobile scale BEFORE animating.** A
    rectangular matte, a cropped subject, dotted/disconnected effects, or
    any UI-reading mark (rings, dots, flashes) are instant rejections;
    they are visible in one still and cost a full re-render round when
    caught late (REP-2 v10 trace).

24. **Stills prove composition; only a playable preview proves motion.**
    Any claim about movement (rotation cues, wake development, wave travel)
    must be validated by delivering a short decodable clip at review size —
    a frame strip cannot show whether an implied-rotation cue or a
    developing wake reads temporally (REP-2 v11: trace frames passed
    composition while the animated wake failed as "smoke ring"; the
    restrained specular sweep read as stationary at phone scale). Review
    verdicts are stored PER COMPONENT (pass/provisional/rejected), never as
    a global success for the attempt.

25. **Caption-collision test before master assembly.** Overlay the target
    caption box (Flair anchor X540/Y1344 on 1080x1920 per the Third Man
    recipe) on the explanatory framings during QA; the mechanism's payoff
    features (boundary, contact point, crest) must sit above ~62% frame
    height. REP-2 v11's contact framing put the interface at 66% — inside
    the band — caught only by this overlay test.

26. **A subject is only visible if it SEPARATES FROM ITS SURROUND — and you
    cannot get separation by darkening near-black.** The requirement is local
    contrast separation; *how* you achieve it is a creative choice. The single
    most expensive defect of REP-3 v2: the "enormous mass" was drawn as a
    multiplicative occluder (`frame *= 1 - mask*0.5`) over abyss plate whose
    luma was already ~11/255. Darkening 11 yields 7 — a 3.4 gray-level delta
    that x264 erases entirely at mobile size. Two Codex passes were spent on
    it. Once a region is at the floor, adding occluder opacity does nothing;
    the separation has to come from somewhere else. Options, in rough order of
    how often they fit: light the medium BEHIND/AROUND the subject (haze
    scatter from a light already in the scene — what REP-3 v2.1 did); give the
    subject an edge the eye can trace (rim, refraction, displacement, a
    disturbance boundary); move the subject to where contrast already exists;
    or re-key the plate so the subject's region is not at the floor to begin
    with. Backlighting is ONE solution, not the rule. The rule is: measure the
    separation (doctrine 27) and do not ship without it. Corollary: never buy
    separation by globally brightening the scene — that destroys the dread and
    still yields no *local* contrast.

27. **Legibility is measured on the DELIVERED COMPRESSED FRAMES, never on the
    render.** At 1080×1920 the v2 mass was plainly visible; at the 270×480
    crf26 the viewer actually sees, it did not exist. Every dark/subtle subject
    gets an objective number before review: mean luma of the subject core vs an
    annulus of its immediate surround, computed on the decoded mobile clip
    (`data/productions/REP-3/tools/rep3_massqa.py` — geometry is REP-3-specific,
    the method is not. NOTE: `data/` is gitignored, so that reference
    implementation is LOCAL ONLY; promote a generalized version into the tracked
    `tools/` next to `finalqa.mjs` when the infrastructure freeze lifts, or the
    next production will inherit this doctrine without the script that enforces
    it). **The gate is: measure it, and a human confirms they can point to the
    subject unprompted on the compressed frame.** The NUMBER is production-
    specific — it depends on plate luma, subject size, motion and grain, so
    there is no universal threshold. REP-3 is a CALIBRATION EXAMPLE, not a
    standard: v2 = 3.4 median (Codex: "a vague patch" — rejected); v2.1 ships at
    14.4 median / 12.8 min / 80-of-80 frames and is plainly pointable. Use those
    as a starting reference for a large soft subject on a near-black plate, and
    re-derive the acceptance number for any production whose conditions differ
    (a small fast subject, or one on a bright plate, will need a different
    figure). Do not chase a higher number by lifting the whole scene — the lift
    must stay local (doctrine 26), and drowning the dread in light fails a
    different review. A subject you cannot point to without being told where it
    is has not been rendered, whatever the 1080p frame shows.

28. **No UNMOTIVATED CLOSED HALOS.** A glow of uniform strength that closes
    into a complete ring around a subject reads as sonar/HUD/UI — the "bullseye"
    defect REJECTED on REP-3 v1's opening pulse. The test is motivation, not
    symmetry: every glow must be traceable to a light source or physical process
    in the scene, and must fall off the way that source would. A symmetrical
    glow is perfectly legitimate when the scene motivates it (a point source in
    fog, a bioluminescent body, a lamp's bloom); an unmotivated ring is UI
    whatever its shape. REP-3 v2.1's mass is lit only where the god-light could
    plausibly reach it — asymmetric BECAUSE the light is off to one side and
    above, not because asymmetry is a rule.

29. **Audit every MODIFIER in a factual claim, not just the claim.** REP-3's
    narration ended "an iceberg cracking apart underwater". The iceberg is
    sourced; the fracture is sourced; **"underwater" is not** — NOAA/PMEL say
    the Bloop was an iceberg cracking and breaking away from an Antarctic
    glacier, and the sound was *recorded* underwater, which is a different
    claim from the fracture *occurring* underwater. One unsupported adverb sat
    on the payoff line through a full review cycle. The claim map in the
    license log must decompose each sentence to the level of individual
    qualifiers (where, when, how) and cite each one, or it is not a claim map.
    Note the same word is legitimate twice earlier in the same script
    ("underwater microphones", "loudest ever recorded underwater") — a word is
    not banned, a *claim* is.

30. **Prefer a waveform edit over re-synthesis — but ONLY when a clean isolated
    boundary exists.** Re-synthesising to change one word forfeits a pinned,
    word-perfect, audition-passed take and restarts the whole audition, so when
    the edit is clean, cut it. It is clean when the boundary is genuinely
    isolated: an RMS floor at true silence between the two words, no coarticu-
    lation across the seam, and (ideally) the cut at a sentence or phrase end.
    REP-3 v2.1 removed the final word "underwater" at 15.695s, where the take
    floors to rms ~0.003 between "apart" decaying and "underwater" attacking —
    a trailing word after a completed phrase, the easiest possible case.
    **Measure the boundary before assuming it.** If the words run together, the
    cut falls mid-phrase, prosody would leave the line hanging, or removing the
    word changes the sentence's intonation contour, then a waveform edit will
    sound wrong and RE-SYNTHESIS IS THE SAFER CHOICE — re-audition and re-pin
    rather than ship a seam. Freed tail time is not refilled: let the closing
    motif ring into the loop, and close any bed-duck window with the narration.

## Captioning a locked master (doctrine 31–38)

The reusable capability lives in `src/postprocess.ts` + the profile
`docs/curio/profiles/locked_master_retention_captions.json`. Before a caption
job, retrieve THAT profile and the validated caption doctrine below — not the
whole production history. REP-3's specific timestamps/wording stay in its brief;
what follows is the transferable principle.

31. **A finished master is captions-ONLY; trimming is structurally disabled, not
    just unchecked.** A locked master's silences and pacing are load-bearing
    (engineered pauses, payoff sync). The integration resolves every job under a
    timeline policy: `locked_master` forces filler/silence removal false and
    REJECTS any request that asks to cut (never silently coerced); `raw_spoken`
    allows trimming only by explicit opt-in. Never rely on a provider/dashboard
    default — Curio's old client hardcoded `cutFillers/cutSilences: true`, which
    would have destroyed exactly the structure a reviewer just approved. The
    resolved operations are persisted with the result so the no-trim guarantee
    is auditable after the fact.

32. **Never silently fall back to auto-transcription.** If the caption provider
    can only auto-generate captions from the audio (no custom track, no reveal
    timing — e.g. the current Mirage `/v1/videos/captions` contract), running it
    on a curated locked master would dump the transcript and spoil the designed
    reveal. Refuse with a capability blocker and report it; auto-captions are
    acceptable ONLY for a video that never had curated wording or a protected
    reveal. Probe account capability before spending a production job.

33. **Reveal protection is a hard rule.** A caption that states the answer must
    never appear before its visual/audio payoff. Hold the prior caption or show
    a bare screen through the pre-payoff beat; intentional blank screens are a
    tension tool, not a gap to fill. Verify it objectively on the export (the
    caption band is empty through the designed silence; the answer caption's
    first pixels land at the payoff, not before), not by eyeballing the render.

34. **Captions maximize comprehension + retention; shares come from the story.**
    Primary outcome retention, secondary shares, and do NOT separately stack
    tactics for likes/saves/comments — a surprising, legible story earns the
    share without "send this," comment bait, or save prompts. Density rules that
    make captions readable at a glance: 2–6 words per screen, one idea per
    screen, max two lines, exactly one 1–3 word emphasis phrase (by weight+scale,
    never loud color), stable lower-center, first caption up by ~0.25s. These are
    LOCKED (objective legibility); which creative strategies win is not — see below.

35. **[SCOPED: Third Man/Captions-app Flair parity only.] When the goal is
    reproducing the posted Third Man benchmark in the Captions.ai app, the
    Flair preset defaults (size 96, large active-word display) ARE the
    benchmark.** Never let "fit"/"shrink"/"never crop" instructions rewrite
    preset sizes — the editor installs them as persistent skills that silently
    scale every caption down (REP-2's export rendered ~4× under benchmark
    while the agent reported "font 86 applied"); fix overflow by wrapping and
    fix a broken style by removing the accumulated skills and restoring preset
    defaults, judged by side-by-side frame parity at identical crop/zoom.
    This is a PARITY procedure, not a Curio caption rule: whether this caption
    look performs for Curio stays PROVISIONAL until replication analytics.

36. **[Captions.ai-app workaround, not universal doctrine.] Inside that app,
    edits go through the editor's built-in AI chat and are verified on
    exported frames.** The style-editor modal Apply chain is lossy/unreliable
    (X is a CENTER coordinate; "Size constraint width" clips glyph edges
    mid-scroll). One chat instruction = one atomic change list; verify every
    accepted change on frames extracted from a fresh EXPORT — the editor
    preview and the agent's own confirmation text both lie. The general
    principle that IS universal lives in #21/#27: verify on the delivered
    artifact, never on a tool's self-report.

37. **Measure every export; relevel only if required.** Locked rule: after any
    third-party render/export, re-measure integrated loudness and true peak
    on the delivered file and correct only when out of spec, releveling with
    the video stream copied (`-c:v copy -af volume=…`) and re-running the full
    QA gate + structural verify vs the master; disclose any leveling in the
    review packet. (Observed evidence, not a universal claim: the REP-2
    Captions.ai app export came back at −14.0 LUFS uniform gain. One export
    proves that one export — not that the app "always renormalizes.")

38. **The production log is the only source of truth for WHICH master gets
    captioned/published.** Parallel sessions advance the same production;
    conversation context (including compaction summaries) goes stale without
    looking stale. REP-2's captions build was executed flawlessly on a master
    the log had already superseded — with a caption line the reviewer had
    vetoed. Before any captions/publish step: read the log's latest entry and
    verify the file IS that master (duration + content anchors), regardless of
    what the chat history says is canonical.

## Caption doctrine (evidence-tiered)

Objective technical facts are LOCKED immediately; creative caption strategies
stay PROVISIONAL until repeated Curio analytics support them (one video cannot
rewrite the strategy). On underperformance, record WHICH component failed and
change one controlled variable from the strongest validated profile — do not
reject the whole format.

- **LOCKED** (objective): trim flags disabled for a locked master; full timeline
  preservation (export audio lag-0, correlation ≥0.98 vs master); first caption
  by ~0.25s; maximum caption density (≤6 words / ≤2 lines / one emphasis phrase);
  reveal timing enforced; post-export structural verification is mandatory.
- **PROVISIONAL** (await analytics — bind to the exact caption config at 24h/72h/
  7d: 3s hold, avg watch, completion, replay; shares/sends per reach; saves/
  comments/likes as secondary diagnostics): split-hook captions (two short
  screens vs one), the intentional blank tension beat before a payoff, the
  weight+scale emphasis style, and caption turnover rate.
- **REJECTED** (proven defective): a captionless opening of ~1.85s (dead first
  beat); transcript-dump captions; answer text shown before the payoff; automatic
  silence trimming on a finished master; excessive animation (bounce/karaoke);
  optimizing every engagement action (likes+saves+comments+shares) simultaneously.

## Final-video QA checklist (run on every master, before every review)

Automated by `tools/finalqa.mjs` (deterministic, no LLM):
- [ ] Container: 1080×1920, 30fps, duration in spec (12–25s), audio stream present
- [ ] Loudness: integrated −17.1 ±1.5 LUFS; true peak ≤ −1.5 dBTP (report LRA)
- [ ] Silence beat: ≥0.35s below −35 dB somewhere in the 50–95% region
- [ ] No black frames (blackdetect)
- [ ] Loop endpoints: first vs last frame SSIM raw + blurred, both reported;
      blurred ≥ 0.90 required
- [ ] Contact sheet emitted (8 frames)

Subject/surround separation (doctrine 26–27) — run whenever a beat carries a
dark or low-contrast subject, on the COMPRESSED mobile clip, not the render:
- [ ] |core − surround| luma delta measured on every frame and REPORTED in the
      production log (`tools/rep3_massqa.py` pattern). The pass number is
      production-specific — derive it, don't inherit it. REP-3 v2.1 (large soft
      subject, near-black plate) shipped at 14.4 median / 12.8 min and reads;
      3.4 was rejected as "a vague patch".
- [ ] A human points to the subject on the compressed frame WITHOUT being told
      where it is. The measurement supports this check; it does not replace it.

Human/vision checks (the script emits the artifacts; a person signs off):
- [ ] Contact sheet at MOBILE size: every beat readable, no dead-black beats
- [ ] Full-res spot frames: no rectangular mattes, no double structures,
      no hard-edged light
- [ ] Endpoint side-by-side: loop reads seamless to the eye
- [ ] Script-to-shot audit: every narration line is shown, not contradicted

## What stays PROVISIONAL (do NOT lock)

Tension progression, reveal-at-75%, loop-ending effectiveness, atmospheric
survival-mystery archetype — all await REP-1/2/3 published analytics. The
external viral-benchmark hypotheses (immediate anomaly, new evidence every
1–3s, continuous micro-payoffs with only the name withheld, literal imagery)
are logged as PROVISIONAL external evidence in data/viral-intelligence and
must NOT be promoted to approved Curio rules until our own publishing
analytics confirm them. Note the contrast with lessons 13–17 above: those are
objective defect classes (a mismatched vessel is wrong regardless of
performance); these are performance hypotheses. A video
can pass every check above and still perform poorly. When the fifth
performance-labeled video lands, run `POST /api/learning/run` and promote only
what the numbers support.

## Narrative-video engine — production-defect rules (LOCKED, added 2026-07-16, Terminal Lucidity)
Objective defects (wrong regardless of performance), same class as lessons 13–17:
- **Local ffmpeg has NO `drawtext`/`subtitles`(libass).** Burn text via Captions.ai, or a
  Pillow RGBA PNG frame-sequence + `overlay`. (qtrle alpha round-trip is unreliable.)
- **`-shortest` masks A/V length mismatch.** Force exact per-segment frame counts
  `round(sec*fps)` (`-frames:v N`) so beats stay synced and totals are deterministic.
- **Seamless visual loop = FREEZE-FRAME endpoint.** Crossfade the tail into a frozen copy of
  the EXACT frame 0, then hold that frame for the final 2–3 frames. Crossfading into the
  *moving* opening fails (subject has moved). NEVER reverse human footage (backward
  blinks/breathing are artifacts).
- **Measure the loop with WINDOWED SSIM on the TRUE decoded frame 0 vs frame N-1**
  (`select='eq(n\,0)'` / `select='eq(n\,N-1)'`). A global-SSIM formula OVERESTIMATES (reported
  0.996 when the real windowed value was ~0.94). Report only true-endpoint windowed SSIM;
  target ≥0.95 (a preview may ship slightly under, but the native export must re-measure).
- **Captions.ai NORMALIZES audio on export** (loudness + mono→stereo). Re-mux the master
  audio back (`-map 0:v -map 1:a -c:v copy`) to hold the −16 LUFS / TP ≤ −1.5 gate.
- **Judge only what a MUTE 270×480 viewer sees + what the final muxed audio says** — not
  intentions/notes. A beat counts only if the viewer can name what changed without the caption.
  Do not self-assign scores; verify against the decoded file.
- Reusable Captions.ai app configuration lives in
  `docs/curio/profiles/locked_master_retention_captions.json`. Retention/tension HYPOTHESES
  (punch-in shot variety, event-driven mix, the 3-layer loop trap) live in VIRAL_PLAYBOOK.md.
- **AUDIO-FIRST APPROVAL GATE (LOCKED, Leon 2026-07-16).** Before spending on ANY paid asset
  (footage/image/Veo/edit/captions), approve the audio at the cheapest stage:
  (1) finalize + fact-check the script; (2) generate <=2 continuous narration takes,
  autonomously select the strongest, save the lossless WAV master; (3) ALWAYS deliver a
  clickable `narration-preview.mp3` (narration only) and STOP for approval; (4) after
  narration approval, build the full audio story (narration + bed + engineered silence +
  tension progression + SFX) as a WAV master and deliver `audio-story-preview.mp3`, STOP for
  approval; (5) only after the audio story passes may PAID VISUAL GENERATION begin. MP3s are
  review copies ONLY — never the production master (keep lossless WAV masters). Every delivery
  includes clickable file:// links to both MP3s (as available) and reports: duration, spoken
  WPM, reveal timestamp + %, engineered-silence duration, integrated LUFS, true peak, and
  whether the semantic loop works. Purpose: catch script/voice problems before Veo/Gemini spend.
- **AUDIO CANNOT BE SELF-JUDGED (LOCKED constraint).** Claude cannot hear the output — the
  narration's emotional prosody ("one thought" vs "a list") and the bed's organic feel are
  NOT verifiable by the model. Measure objective proxies only (duration, loudness/TP, silence,
  pause variation between words, layer envelopes) and route the SUBJECTIVE audio verdict to a
  human ear or an audio-capable judge. Never claim an emotional/tonal audio pass from
  intentions; state the limit and defer that call.
- **NO inert post-speech tail; the semantic re-hook must land AT replay (Terminal Lucidity
  v6→v6.2, Leon 2026-07-16).** Sizing the runtime to force a reveal % left 1.65s of dead bed after
  the last word — Leon judged this inert tail LIKELY to hurt retention (no retention analytics were
  captured for this video) and confirmed it harmed the LOOP. Size the piece so the final word ends
  near the end, allow only a short breath (<~0.4s), then loop. Reveal % is a HEURISTIC, not a
  target: an honest later reveal (~84%) beats padding — never add filler to hit a percentage.
- **Loop-seam LEVEL match (±1 dB), not just "no click".** A sample-level no-click is insufficient:
  the opening room tone was 12.7 dB louder than the faded tail floor — an audible restart JUMP.
  Fix by an EASED crossfade of the final ~150–200ms into the VOICE-FREE opening ambient (the first
  ~0.30s, before narration begins) so the end lands within ±1 dB of the opening — never a sudden
  gain step, never by lengthening the tail. Objective proxy: RMS(final 100ms) vs RMS(opening 0.30s).
- **Editing a LOCKED audio tail stays byte-EXACT before the edit point.** Work in int16 (a
  ÷32768 then ×32767 float round-trip flips ±1 on nearly every sample), keep everything before the
  tail identical, and VERIFY with `np.array_equal`. Never re-normalize the whole file to fix a tail.
- **Captions clear the instant the final word ends, and the visual return-to-opening crossfade is
  already UNDERWAY during that word** — not a dead hold that then cuts.
- **MANDATORY loop audition before approval (LOCKED, Leon 2026-07-16).** The seam cannot be
  self-heard, so deliver (a) a `*-loopx2.mp3` = two BYTE-IDENTICAL copies back-to-back with no
  gap/crossfade/processing between them, to audition the real end→beginning seam, and (b) a
  low-resolution audiovisual loop — then route the seam verdict to a human ear. Report the measured
  seam RMS gap as the objective proxy.
- **Loop-seam level fix constraints (CPR v1, 2026-07-17):** measure the restart gap at
  50/100/200/300ms windows; target ~2–4 dB perceptual, never flatten the hook to chase ±1 dB.
  When limiting a lifted tail, HARD-re-cap the gain curve AFTER smoothing (smoothing leaks
  neighbors' gains over the ceiling) and leave ~2 dB of inter-sample margin below the sample
  ceiling (a −1.9 dBFS sample ceiling still measured −1.2 dBTP true peak; −3.6 dBFS held −1.6).
  REJECTED: rhythmic pickup beats that quicken into the seam when the script premise is "no
  pulse" — an accelerating thump pattern reads as a heartbeat and contradicts the story.
- **Chained-seed continuity (LOCKED, CPR build 2026-07-17):** for multi-clip Veo scenes, seed
  clip N+1 from clip N's LAST FRAME (not the shared reference) — same patient/team/room/light/
  positions, no pose resets. For a focused INSERT, seed from a 9:16 CROP of an existing frame
  (region of interest) — identity carries through the crop.
- **Crops are shot grammar, not beats (LOCKED, Leon guardrail 2026-07-17):** a punch-in of
  already-shown motion never counts as story development. If a causal state is missing (e.g.
  "compressions resume → awareness returns"), GENERATE a focused insert for it rather than
  stretching or re-cropping weak footage.
- **AV-causality sync (LOCKED, CPR v1):** the visual cause must land where the AUDIBLE cause
  lands. The locked audio's event map (thump stop/resume, collapse, reveal) dictates the edit —
  e.g. visible compressions may NOT resume while the bed's thumps are still stopped.
- **Veo overshoots directed motion late in the clip (CPR-D):** a prompt asking for "slight
  purposeful hand movement" delivered it in 0–4.5s, then escalated to a raised rigid forearm
  (possession-adjacent imagery). Inspect every clip and prefer EARLY windows; never assume the
  whole 8s is usable.
- **Phone-size frame-zero check (LOCKED):** verify the opening contradiction reads at 270px on
  the actual graded frame — a grade that looks moody at 720p can bury the premise at feed size
  (v1 fix: brightness +0.006 / gamma 1.02 lift, loop SSIM re-verified after regrade).
