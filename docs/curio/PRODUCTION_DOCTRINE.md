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

35. **In the Captions.ai app, the preset defaults ARE the benchmark parity.**
    The Flair preset as it ships (size 96, large active-word display) is what
    the posted Third Man winner used. Never let "fit"/"shrink"/"never crop"
    instructions rewrite preset sizes — the editor installs them as persistent
    skills that silently scale every caption down (REP-2's export rendered ~4×
    under benchmark while the agent reported "font 86 applied"). Fix overflow
    by wrapping, and fix a broken style by REMOVING the accumulated skills and
    restoring preset defaults. Size is judged only by a side-by-side frame
    parity test against a posted benchmark export at identical crop/zoom —
    never by "looks clean" on a single render.

36. **Captions.ai edits go through the editor's built-in AI chat; verify on
    exported frames.** The style-editor modal Apply chain is lossy/unreliable
    (X is a CENTER coordinate; "Size constraint width" clips glyph edges
    mid-scroll). One chat instruction = one atomic change list, and every
    accepted change is verified on frames extracted from a fresh EXPORT — the
    editor preview and the agent's own confirmation text both lie.

37. **Captions.ai exports re-normalize audio (observed −14.0 LUFS uniform
    gain).** Always re-measure the export, re-level with the video stream
    copied (`-c:v copy -af volume=…`), and re-run the full QA gate plus the
    structural verify against the master. Disclose the leveling step in the
    review packet.

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
