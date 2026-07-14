# REP-2 "Dead Water" — production brief (APPROVED, rev 2)

Status: **SCRIPT APPROVED by Codex review 2026-07-13** (rev 2 applies every
required edit). Next gate: Captions.ai build → exported MP4 to Codex for
pre-post video review. Local renderer NOT used. Nothing posts before the
video review passes.

One-outcome declaration: **retention primary, shares secondary.**
Outcome moment: the named reveal at ~72% — "Sailors called it dead water."

Rev 2 changes (Codex 2026-07-13): anomaly-first hook (no date/context open);
"engine" singular (the Fram had one); staged crew action removed; "from the
surface you see nothing" removed (Nansen describes visible ripples across the
wake — the surface is calm, not featureless); "denser salt water" replaces
"heavy salt sea"; the 6–7-knot figure removed from THIS incident's inventory
(that's the Fram's favorable/light-cargo capability — this encounter was
~4.5–5 knots expected vs 1–1.5 achieved); primary sources linked directly.

---

## 1. Source packet

### Primary sources (linked directly)

1. **Nansen, F. — [*Farthest North* (1897), full text at Project Gutenberg](https://www.gutenberg.org/files/30197/30197-h/30197-h.htm).**
   August 1893, the *Fram*, near the Nordenskiöld Archipelago / Taymyr
   Peninsula, north of Siberia. The account documents: the engine at full
   power with very slow progress; looping and turning maneuvers ("We made
   loops in our course, turned sometimes right around, tried all sorts of
   antics to get clear of it"); the ship "held back, as if by some mysterious
   force," not always answering the helm; a fresh meltwater layer over salt
   water; and **visible ripples/waves across the wake** — the surface was
   calm but not featureless. Speed for THIS encounter: roughly **4.5–5 knots
   expected vs 1–1.5 knots achieved**.

2. **Ekman, V. W. — [*On Dead Water*, in The Norwegian North Polar Expedition
   1893–1896: Scientific Results, vol. V (original volume, PDF)](https://upload.wikimedia.org/wikipedia/commons/b/b2/The_Norwegian_North_polar_expedition%2C_1893-1896%3B_scientific_results_%28IA_norwegiannorthpo05nans%29.pdf).**
   At Vilhelm Bjerknes's request, Ekman reproduced the phenomenon in
   laboratory tanks: **internal waves generated at the interface between a
   fresh/brackish surface layer and denser salt water below**. A ship whose
   draught sits near that interface expends its propulsion energy creating
   and maintaining these subsurface waves instead of moving forward.

3. **Fourdrinoy et al. — [PNAS 2020, "The dual nature of the dead-water
   phenomenology: Nansen versus Ekman wave-making drags" (PMC full text)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7382212/)**
   ([CNRS summary](https://www.cnrs.fr/en/press/behind-dead-water-phenomenon)).
   Modern confirmation and refinement: two drag regimes — **Nansen drag**
   (constant abnormal slowness) and **Ekman drag** (transient speed
   oscillations from the initial acceleration); the internal waves act "like
   an undulating conveyor belt" under the hull. Dead water can occur today in
   suitably stratified waters — draft, speed, and stratification conditions
   must align; layering alone does not guarantee the effect.

### Verified-fact inventory (everything the script is allowed to claim)

| # | Claim | Source |
|---|-------|--------|
| F1 | 1893, Nansen's ship *Fram*, Arctic waters north of Siberia | Nansen 1897 |
| F2 | Engine (singular) at full power; the ship barely moved — ~4.5–5 knots expected vs 1–1.5 achieved in this encounter | Nansen 1897 |
| F3 | The crew looped, turned around, "tried all sorts of antics" to get free | Nansen 1897 (direct account) |
| F4 | The surface was calm with visible ripples/waves across the wake — strange, but not featureless | Nansen 1897 |
| F5 | Cause: Arctic meltwater layer above denser salt water | Nansen 1897; Ekman 1904; PNAS 2020 |
| F6 | The propeller's energy feeds internal waves at the boundary between the layers | Ekman 1904; PNAS 2020 |
| F7 | "Dead water" is the nautical term for the phenomenon | Nansen 1897; Ekman 1904 |
| F8 | It can still occur today in suitably stratified waters (draft, speed, and stratification conditions must align — layering alone doesn't guarantee it) | PNAS/CNRS 2020 |

### Dramatic wording — flagged, and what grounds it

| Script line | Status |
|---|---|
| "At full power, Nansen's ship barely moved." | FACT (F1, F2) |
| "They looped, turned around, tried everything." | FACT (F3) — direct paraphrase of Nansen's own account |
| "The force was underneath." | FRAMING of F5/F6 — "force" echoes Nansen's "mysterious force"; location (underneath) is factual |
| "Arctic meltwater sat above denser salt water." | FACT (F5) |
| "The propeller was feeding internal waves between them." | FACT (F6) |
| "Sailors called it dead water." | FACT (F7) |
| "The ship was fighting waves hidden inside the sea." | FACT (F6) restated — "hidden inside the sea" = internal waves, accurate and memorable; loops into the calm opening |

### Excluded as speculation or out-of-scope (do NOT use)

- **Battle of Actium (31 BC) hypothesis** — CNRS's own team labels it speculation.
- Swimmer-drowning connections — hypothesized in coverage, not established.
- Any named modern ship incident — none verified in the packet.
- The 6–7-knot figure — real, but it describes the Fram's favorable/light-cargo
  capability, not this encounter. Not used anywhere.
- "From the surface you see nothing" — too absolute; Nansen saw wake ripples. Cut.

---

## MASTER v8 (2026-07-13) — MEDIUM REPLACEMENT; script/narration/mix UNCHANGED

Codex rejected v7 at the creative gate: the vector renderer hit its quality
ceiling ("vector aesthetic ceiling — do not parameter-polish the same
artwork"). Directive: replace the visual medium. Publish-readiness on v7 ~6/10,
visual consistency 4.5, premium finish 5. LOCKED and untouched in v8: script
rev 5, narration-v5 audio, the ENTIRE stereo mix (mix-v7-final.wav reused
verbatim — audio was scored 8.5), measured 0.49s silence, no footer, loop.

v8 rebuild — every explanatory shot is now a PHOTOGRAPH (doctrine 18):
- One photoreal underwater cross-section plate generated from the hero frame
  (gpt-image-1): period hull underside, bronze 4-blade propeller + rudder,
  silver bubble churn, lighter meltwater over near-black saltwater, internal
  wave at the boundary. A swollen-wave variant plate gives real boundary
  deformation. A derived stern close-up plate for the propeller beat. A
  moonlit overhead ship sprite (recognizable steamer: deck, 3 masts,
  lifeboats, funnel, bow wave) for the trace.
- All motion is 2.5D camera work in ffmpeg (zoompan), bounded-memory, one
  process at a time — NO vector shapes, NO UI glow/rings/fiber-optic trail:
  · descent = reveal-crane from surface down to hull+prop+two layers
  · mech1 = push-in on the real propeller + churn
  · mech2 = calm→swell plate crossfade: the internal wave visibly RISES under
    the prop as the boundary deforms (cause→effect, physical)
  · hold = same framing dimmed (silence beat)
  · reveal = push-IN to the closest, clearest full-system frame (hull, both
    layers, prop energy, swollen wave simultaneously) — NOT a pullback
  · trace1/trace2 = overhead miniature ship (the SUBJECT) on a moonlit sea
    with a continuous turbulent foam wake; comp A hard turn, comp B
    camera-tracked self-crossing loop
- Medium unity: above-water hero footage and underwater plates share one
  Arctic-navy palette and the same vessel character — the cinematic↔diagram
  break is gone because there is no diagram.
- finalqa ALL PASS: 17.97s, -17.1 LUFS, TP -2.0, silence 12.68s/0.49s, no
  black, loop SSIM 0.972. scdet = 10 distinct photographic compositions
  (Codex floor 8). Muxed-MP4 transcript PERSISTED next to the master
  (REP-2-pre-captions-master-v8-transcript.json): word-perfect, "dead water"
  intact at 12.72s.
- Hardware note (doctrine 19): the first compositor preloaded stock frames and
  froze the 8GB machine twice; rebuilt on ffmpeg + a memory-trivial two-PNG
  trace compositor (peak RSS ~500MB, sequential).
- STATUS: awaiting Codex pre-caption review. NOT production-ready until the
  creative gate passes. Do not enter Captions.ai.

---

## MASTER v9 (2026-07-13) — MECHANISM CLARITY; everything approved kept verbatim

Codex on v8: passed medium-replacement + hardware gates, FAILED mechanism
clarity (4.5/10; publish 6.5). A mute viewer got "propeller churns water,"
not "meltwater over saltwater creates hidden internal waves that absorb the
ship's force." LOCKED and untouched: script rev 5, narration-v5,
mix-v7-final.wav verbatim, silence, no footer, loop, and the v8
s1-hero/punch/trace1/calm-hero/descent/sting-hero beats.

v9 surgical rebuild (mech1, mech2, hold, reveal, trace2 only):
- THREE system-state plates (gpt-image-1, edited from plate-master for
  identity): W0 = calm shimmering density LENS ~1.5 prop diameters below the
  propeller, lighter particle-rich gray-cyan meltwater above, near-black calm
  salt water below — hull, prop, both layers, and interface all in ONE frame;
  W1 = churn cone physically REACHING the interface, first wave hump directly
  under the prop; W2 = wave grown ~2x, crest traveled astern, whole interface
  undulating. Natural refraction only — no glow line, no UI.
- Codex's exact causal sequence: mech1 = prop close-up that pulls DOWN to
  reveal the boundary (zoompan 2.4→1.32 on W0); mech2 = W0→W1→W2 crossfade
  chain (flow arrives → wave begins → wave grows); hold = W2 dimmed only
  -0.03 (readable on a dim phone, v8's crush fixed); reveal = the WIDEST,
  brightest (+0.035) frame in the video — slow 1.10→1.01 pull-out on the full
  W2 system plate. The payoff shows the entire cause-and-effect system.
- Interface sits ~60% frame height in every mech/reveal framing — outside the
  bottom caption band; captions cannot cover the wave.
- trace2: the ROUTE is now the subject — ship 0.34 scale (was 0.84 tracked),
  camera centered on the loop with a gentle 1.10→1.20 push, path completes at
  72% of the beat so the completed self-crossing loop HOLDS ~11 frames, with
  a doubly-churned crossing highlight and a time-decaying flash.
- Hardware: all renders ffmpeg or the two-PNG trace compositor, strictly
  sequential, -threads 2, peak RSS 620MB max (a 798MB single-process mech2
  attempt was restructured into segments+xfade at 400MB per the 750MB cap).
- finalqa ALL PASS: 17.97s, -17.1 LUFS, TP -2.0, silence 12.68s/0.49s, no
  black, loop SSIM 0.972, 539f exact locked map. Muxed-MP4 transcript
  PERSISTED (REP-2-pre-captions-master-v9-transcript.json) — text IDENTICAL
  to v8's, "dead" at 12.72s. License log gains the gpt-image plate entry
  (pending since v8).
- STATUS: awaiting Codex pre-caption review. NOT production-ready until the
  creative gate passes. Do not enter Captions.ai.

## MASTER v7 (2026-07-13) — Codex creative-gate rebuild; script rev 5 UNCHANGED

Codex REJECTED master v6 at the pre-caption CREATIVE gate (automated QA had
passed — technical compliance only; readiness scored ~5.5/10). Independent
mobile-frame review: abstract trace line instead of a struggling ship, diagram
vessel not matching the hero, asterisk-like propeller, near-invisible pulses,
undifferentiated water layers, reveal that pulls AWAY, "beats" that were
motion inside one composition, and a cinematic-vs-diagram style break.
LOCKED and untouched in v7: script rev 5, restrained delivery (narration-v5
audio reused verbatim), stereo mix concept, measured pre-reveal silence, no
footer, calm-surface loop ending.

v7 rebuild (renderer tools/rep2_scene_v4.swift, doctrine lessons 13–17):
- Vessel redrawn to the hero's silhouette signatures: tall central funnel +
  smoke column, three near-bare masts with crosstrees, pale boat-cover row,
  long low tonally-shaded hull. Same drawn ship above AND below water.
- Propeller: hub + three filled blade petals + sweep disc, short visible
  shaft with strut, shaped rudder. mech1 frames it at quarter-frame height.
- CONTINUOUS luminous trail prop→boundary (always-connected core + streaming
  particles); every pulse arrival visibly steps the wave AT the impact point.
- Density boundary raised to ~200px under the keel (was ~390): cause→effect
  in one glance.
- Melt vs salt: lighter cold moving layer (lateral current streaks, light
  shafts) over near-black static mass (heavy murk band, sparse slow
  particles).
- Trace rebuilt: top-down SHIP (hull, funnel dot + smoke smudge, mast dots,
  bow-wave chevrons) with turbulent wake ribbon + V-wake. Comp A fixed-camera
  hard 150° turn with outward skid churn; comp B camera-TRACKED self-crossing
  loop with crossing flash. Two genuinely distinct compositions.
- Reveal now PUSHES IN to the closest, strongest system view (zoom 1.02→1.45);
  crest grows at the impact side, reaching toward the prop.
- 11 beats / 10 distinct compositions (hold is the dimmed silence variant of
  mech2's framing): hero, stern punch-in, trace-turn, trace-loop, calm hero,
  descent, prop close-up, wave growth, hold, reveal push-in, calm return.
- Mix v7 (stereo 48k, synthesized + narration-v5): calm/underneath passage
  lowered ~2.5dB (voice 0.75 in word-gap switches 5.98/9.44), crescendo to
  1.0, gate 12.66–13.17, boom 0.9 UNCHANGED, thumps 10.27/11.07/11.87
  unchanged, 0.88 name / 0.80 closer preserved. LRA 2.9 (v6: 2.1) —
  honest arc, boom untouched.
- finalqa ALL PASS: -17.1 LUFS, TP -2.0, silence 12.68s/0.49s <-35dB, no
  black, loop SSIM 0.972 blurred / 0.960 raw.
- MUXED-MP4 transcript (whisper-1 on the final container): word-perfect,
  "Sailors called it dead water" intact through the gate (12.14–13.72).
- STATUS: awaiting Codex pre-caption review. NOT production-ready until the
  creative gate passes. Do not enter Captions.ai.

---

## MASTER v9 (2026-07-13) — MECHANISM CLARITY; everything approved kept verbatim

Codex on v8: passed medium-replacement + hardware gates, FAILED mechanism
clarity (4.5/10; publish 6.5). A mute viewer got "propeller churns water,"
not "meltwater over saltwater creates hidden internal waves that absorb the
ship's force." LOCKED and untouched: script rev 5, narration-v5,
mix-v7-final.wav verbatim, silence, no footer, loop, and the v8
s1-hero/punch/trace1/calm-hero/descent/sting-hero beats.

v9 surgical rebuild (mech1, mech2, hold, reveal, trace2 only):
- THREE system-state plates (gpt-image-1, edited from plate-master for
  identity): W0 = calm shimmering density LENS ~1.5 prop diameters below the
  propeller, lighter particle-rich gray-cyan meltwater above, near-black calm
  salt water below — hull, prop, both layers, and interface all in ONE frame;
  W1 = churn cone physically REACHING the interface, first wave hump directly
  under the prop; W2 = wave grown ~2x, crest traveled astern, whole interface
  undulating. Natural refraction only — no glow line, no UI.
- Codex's exact causal sequence: mech1 = prop close-up that pulls DOWN to
  reveal the boundary (zoompan 2.4→1.32 on W0); mech2 = W0→W1→W2 crossfade
  chain (flow arrives → wave begins → wave grows); hold = W2 dimmed only
  -0.03 (readable on a dim phone, v8's crush fixed); reveal = the WIDEST,
  brightest (+0.035) frame in the video — slow 1.10→1.01 pull-out on the full
  W2 system plate. The payoff shows the entire cause-and-effect system.
- Interface sits ~60% frame height in every mech/reveal framing — outside the
  bottom caption band; captions cannot cover the wave.
- trace2: the ROUTE is now the subject — ship 0.34 scale (was 0.84 tracked),
  camera centered on the loop with a gentle 1.10→1.20 push, path completes at
  72% of the beat so the completed self-crossing loop HOLDS ~11 frames, with
  a doubly-churned crossing highlight and a time-decaying flash.
- Hardware: all renders ffmpeg or the two-PNG trace compositor, strictly
  sequential, -threads 2, peak RSS 620MB max (a 798MB single-process mech2
  attempt was restructured into segments+xfade at 400MB per the 750MB cap).
- finalqa ALL PASS: 17.97s, -17.1 LUFS, TP -2.0, silence 12.68s/0.49s, no
  black, loop SSIM 0.972, 539f exact locked map. Muxed-MP4 transcript
  PERSISTED (REP-2-pre-captions-master-v9-transcript.json) — text IDENTICAL
  to v8's, "dead" at 12.72s. License log gains the gpt-image plate entry
  (pending since v8).
- STATUS: REJECTED by Codex (boundary clearer, total experience degraded:
  plate-identity drift, exposure flicker, static machinery, rope-like
  interface, weaker reveal, ship too small). v9 SHELVED. v8 is the visual
  baseline again.

---

## v10 (2026-07-13) — MECHANISM-ONLY PREVIEW; no master until Codex passes it

Codex directive after v9: never generate independent W0/W1/W2 state images
again (photographic identity cannot survive independent generations). Animate
ONE continuous v8 plate instead, and prove the mechanism in a short low-res
preview before assembling any 18-second master.

- rep2_mech_preview.py animates cam-master.png with one exposure throughout:
  hub-measured propeller disc rotating with rotational motion blur; wash
  particles descending from prop to interface; the interface as a subtle
  heat-haze refractive displacement band (never a drawn line); at contact the
  band deforms into a lateral traveling wave whose two crests propagate away
  from the impact point; restrained static local grading differentiates the
  layers (cyan/particles above, denser dark below). Camera: rotating-prop
  close-up → tilt to interface → contact → wave travels → moderately wider
  full-system frame (machinery stays large).
- trace2 intermediate scale 0.52 (v8 0.84 / v9 0.34), loop box 720x640: ship
  recognizable AND crossed route legible.
- Hardware: single process, threads capped, peak RSS 414MB (<750 cap).
- Tech note: cv2 5.x remap silently corrupts on float64 maps (numpy 2.x
  scalar promotion) — all remap maps must be float32.
- DELIVERABLES: mech-preview-v10.mp4 (540x960 8s), trace2-v10-frame.png,
  trace2-v10-hold.png (data/productions/REP-2/, local).
- STATUS: preview awaiting Codex mechanism gate. NO master assembly, no
  script/narration/mix/hero changes. Do not enter Captions.ai.

## 2-REV5. FINAL script (Codex external-benchmark rebuild 2026-07-13 — supersedes §2-REV4; MASTER v6)

Codex REJECTED v5 for production after benchmarking against live viral Shorts
(Zack D. Films grave-bell 107.9M / Tootsie Rolls 121.7M, ocean-physics 59.6M
@615×; references logged as PROVISIONAL in data/viral-intelligence/
competitor-videos.json — NOT promoted to rules). Core correction: viral videos
provide continuous micro-payoffs while withholding only the final name — v5
had 4 machine-detected visual changes / 18.2s vs Third Man's 8 / 20.2s.

> In the Arctic, a ship ran at full power... and barely moved. The crew
> turned. Looped. Tried everything. Still, the surface stayed calm. Something
> underneath was stopping them. Their own propeller was feeding waves they
> couldn't see. Sailors called it dead water. Meltwater floated over heavier
> salt water. Above it, the sea stayed calm.

Narration: narration-v5.mp3/.wav, 17.94s (~178 WPM, in Codex's 170–180
window), pinned voice settings. HONEST pacing audit (doctrine #12, two
yardsticks): whisper word-gaps — turned→looped 0.48s (PROVEN voiced clipped
delivery, −17 dB energy inside the gap; NOT dead air), calm→Something 0.40s
(true quiet only 0.16s, rest is breath + onset), all others ≤0.38s; energy
(−38 dB) — every non-reveal true-silence span ≤0.21s. Two surgical trims made
INSIDE measured true silence only (see→Sailors −0.16s, saltwater→Above
−0.08s), re-transcribed clean. Reveal collapse: 0.491s pre-AAC → **0.473s
measured after AAC** (spec 0.46–0.50 ✓). "dead" = 73.4% runtime, word 41/54 =
76% by position. TTS note: one take discarded (em-dash → 3s gibberish, again;
whisper caught it).

11-beat shot plan (539 frames @30fps = 17.967s, frame-quantized to acoustic
onsets; renderer = tools/rep2_scene_v3.swift — unified drawn vessel,
shaft-attached propeller, navy/gray textured water, NO teal):
| beat | time | look | narration |
|---|---|---|---|
| 1 | 0.00-2.53 | hero: smoke+churn, not moving | "In the Arctic, a ship ran at full power..." |
| 2 | 2.53-3.27 | TIGHT stern punch-in: prop-wash evidence | "and barely moved." |
| 3 | 3.27-4.73 | ocean trace: first hard turn | "The crew turned." |
| 4 | 4.73-6.03 | trace: self-crossing loop | "Looped. Tried everything." |
| 5 | 6.03-7.97 | calm hero hold (contradiction) | "Still, the surface stayed calm." |
| 6 | 7.97-9.57 | descent below the waterline | "Something underneath was stopping them." |
| 7 | 9.57-11.10 | mechanism A: attached prop feeds pulses | "Their own propeller was feeding waves" |
| 8 | 11.10-12.67 | mechanism B: wave visibly grows per pulse | "they couldn't see. Sailors called it" |
| 9 | 12.67-13.17 | SILENCE HOLD: static, slowed, dimming | (0.47s acoustic collapse) |
| 10 | 13.17-16.33 | decisive pullback: full system | "dead water. Meltwater floated over heavier salt water." |
| 11 | 16.33-17.97 | calm hero return (loop) | "Above it, the sea stayed calm." |

Perceptual-change count: 7 machine-detected scene changes (scdet 0.06; v5 had
4) + 4 continuous-camera developments (turn→loop, mech phase A→B, hold dim,
reveal pullback) = 11 beats. Audio-visual sync: three low thumps land exactly
on the mechanism's pulse arrivals (10.27/11.07/11.87).

Mix v6: STEREO 48kHz (voice centered, decorrelated L/R atmosphere, thumps
biased slightly right toward the prop). Calm/underneath passage −4 dB; gradual
rise through the mechanism; boom 0.9 subordinate; voice delivery-shaped per
Codex direction ("dead water" 0.88, closer 0.80 — switched inside word gaps).
Measured: −16.9 LUFS, TP −3.7, LRA 2.1 by finalqa's yardstick (v5: 1.3, Third
Man: 3.1) / 2.8 by ebur128 on the raw mix. FOOTER REMOVED entirely (exit-signal
risk; the blink-length alternative conflicts with the loop-endpoint rule).

Captions for the Captions.ai build (Codex rev-5 list — per-shot designed, ONE
amber emphasis per beat, verify each against the action beneath it; beats 5-7
of the caption list ride mechanism/reveal):
1. "FULL POWER. / BARELY MOVED." — amber: **BARELY MOVED**
2. "TURNED. LOOPED. / TRIED EVERYTHING." — amber: **LOOPED**
3. "THE SURFACE / STAYED CALM." — amber: **STAYED CALM**
4. "SOMETHING UNDERNEATH / WAS STOPPING THEM." — amber: **UNDERNEATH**
5. "THEIR OWN PROPELLER..." — amber: **THEIR OWN**
6. "...FED WAVES / THEY COULDN'T SEE." — amber: **COULDN'T SEE**
7. "SAILORS CALLED IT / DEAD WATER." — amber: **DEAD WATER**
8. "MELTWATER OVER / HEAVIER SALT WATER." — amber: **MELTWATER**
9. "ABOVE IT: / CALM SEA." — amber: **CALM SEA**
⚠ trace shots keep the course clear of the fixed caption zone (path fitted to
y 360-1140; captions at Y1344 land on open water).

MASTER: REP-2-pre-captions-master-v6.mp4 — finalqa ALL PASS (−16.9 LUFS,
TP −3.7, silence beat 12.70s 0.47s <−35dB, no black, loop blurred SSIM 0.972 /
raw 0.959, stereo verified). GATE: submit to Codex BEFORE captioning.

## 2-REV4. Script rev 4 (superseded by 2-REV5 — v5 master rejected on external benchmark)

Codex verdict on rev 3's master (v4): technically polished but too many
concepts (Nansen, Arctic, helm, stealing force, two waters, invisible waves)
— viewer translates nautical/scientific language while following the mystery.
Rev 4: one idea per sentence, crew introduced immediately, no proper name in
narration (Nansen + 1893 move to the post caption), no "helm". CLOSER VETO
RESOLVED: Codex vetoed its own "From the deck, you could see nothing" (too
absolute — wake ripples are visible); replaced with "From the deck: only calm
water", which matches frame zero exactly.

> An Arctic ship ran at full power... and barely moved. The crew turned.
> Looped. Tried everything. But the surface stayed calm. The trap was
> underneath. Every turn of the propeller fed invisible waves. Sailors
> called it dead water. Fresh meltwater floated over salt water. From the
> deck: only calm water.

Narration: narration-v4.mp3, 18.16s measured, pinned voice settings (stability
.45 / similarity .70 / style .20 / boost / speed 1.04). Leon's pause
constraint honored: SSML breaks compound with the voice's natural sentence
pauses, so explicit breaks are minimal (0.15s after "underneath.", 0.35s
before "dead water") — measured result: the ONLY long pause is the engineered
reveal beat at 12.27-12.72 (0.45s, bottom of Codex's 0.45-0.55 window); every
other gap ≤0.37s. Nothing trim-worthy, no dead air. ⚠ TTS note: the em-dash
in "full power — and" made eleven_multilingual_v2 mumble gibberish for ~3s
(one bad take, caught by whisper transcript check); ellipsis fixed it. Add to
doctrine: transcript-verify every take, avoid em-dashes in TTS text.
"dead" = word 37/50 = 74% by word position (Codex's number); acoustically
lands 12.72s = 70% of runtime.

Shot map (same 7 looks, frame-quantized to measured acoustic onsets, 545
frames @ 30fps = 18.167s):
| look | time | narration |
|---|---|---|
| 1 hero anomaly | 0.00-3.27 | "An Arctic ship ran at full power... and barely moved." |
| 2 course trace | 3.27-5.63 | "The crew turned. Looped. Tried everything." |
| 3 calm hero hold | 5.63-7.20 | "But the surface stayed calm." |
| 4 descent | 7.20-8.73 | "The trap was underneath." + 0.37s dread pause |
| 5 mechanism/propeller | 8.73-12.70 | "Every turn of the propeller fed invisible waves. Sailors called it" + 0.45s silence |
| 6 full cross-section reveal | 12.70-16.20 | "dead water. Fresh meltwater floated over salt water." (flare +0.35s as the name lands) |
| 7 hero return (loop) | 16.20-18.17 | "From the deck: only calm water." (quiet, intimate; footer 16.6-17.9) |

Captions for the Captions.ai build (Codex-locked, ONLY these emphasis words;
captions 5-7 ride the mechanism/reveal section):
1. "Full power. Barely moving." — **BARELY MOVING**
2. "They turned. Looped. Tried everything." — **LOOPED**
3. "But the surface stayed calm." — **STAYED CALM**
4. "The trap was underneath." — **UNDERNEATH**
5. "The propeller fed invisible waves." — **INVISIBLE WAVES**
6. "Sailors called it dead water." — **DEAD WATER**
7. "Fresh water over salt water." — **FRESH WATER**
8. "From the deck: calm water." — **CALM WATER**

MASTER: REP-2-pre-captions-master-v5.mp4 — finalqa ALL PASS (-17.1 LUFS,
TP -2.0, silence beat 12.28s 0.43s <-35dB, no black, loop blurred SSIM 0.972 /
raw 0.958). Gate: Leon watch → Captions.ai build → Codex pre-post review.

## 2-REV3. Script rev 3 (superseded by 2-REV4 above — closer vetoed by Codex)

Codex verdict on rev 2's master: all production gates pass, but tone was a
"classroom explanation" vs Third Man's human dread. Rev 3 adds human struggle
and WITHHOLDS the science until after the name. Same facts, same 7 looks.

> At full power in the Arctic, Nansen's ship barely moved. They turned.
> Looped. Tried everything. The helm barely answered — but the surface stayed
> calm. Something underneath was stealing the propeller's force. Sailors
> called it dead water: invisible waves between fresh and salt water. From
> the deck, you could see nothing.

Narration: narration-v3.mp3, 18.81s measured, pinned voice settings, restrained
dread (clipped escalation via punctuation; SSML breaks 0.4s after "calm.",
0.5s before "dead water", 0.35s before the final line). Acoustic truth:
"dead" lands 12.80s = 68%... reveal name spoken 12.80-13.52; science follows.

Shot map (same visual architecture, retimed to measured onsets):
| look | time | narration |
|---|---|---|
| 1 hero anomaly | 0.00-3.10 | "At full power... barely moved." |
| 2 course trace | 3.10-5.40 | "They turned. Looped. Tried everything." |
| 3 calm hero hold | 5.40-8.60 | "The helm barely answered — but the surface stayed calm." + 0.4s dread pause |
| 4 descent | 8.60-10.20 | "Something underneath..." |
| 5 mechanism/propeller | 10.20-12.80 | "...stealing the propeller's force. Sailors called it" + 0.5s silence |
| 6 full cross-section reveal | 12.80-16.60 | "dead water: invisible waves between fresh and salt water." |
| 7 hero return (loop) | 16.60-18.81 | "From the deck, you could see nothing." (quiet, intimate) |

Captions for the Captions.ai build (3-7 words, ONLY these emphasis words):
1. "Full power. Barely moved." — **BARELY MOVED**
2. "They turned. Looped. Tried everything." — **LOOPED**
3. "The surface stayed calm." — **CALM**
4. "Something underneath." — **UNDERNEATH**
5. "Stealing the propeller's force." — (no emphasis)
6. "Sailors called it dead water." — **DEAD WATER**
7. "From the deck — nothing." — **NOTHING**

⚠ FACTUAL FLAG for Codex: round 2 removed "From the surface—you see nothing"
as too absolute (Nansen saw wake ripples). Rev 3's Codex-authored closer is
"From the deck, you could see nothing." Shipped verbatim per reviewer text;
frame zero still shows subtle wake ripples. Veto or confirm.

## 2. Script rev 2 (superseded by 2-REV3 above)

> At full power, Nansen's ship barely moved. They looped, turned around,
> tried everything. The force was underneath. Arctic meltwater sat above
> denser salt water. The propeller was feeding internal waves between them.
> Sailors called it dead water. The ship was fighting waves hidden inside
> the sea.

46 words → **≈17.5s** at the Third Man documentary pace. The anomaly lands in
the first sentence — no date, no context spend. Reveal begins at ~12.6s =
**~72% of runtime** (spec window 70–80%). The closing line ("waves hidden
inside the sea") loops into the apparently-calm opening image.

## 3. Shot timeline (9:16, 7 shots ≈ one visual change per 2.5s)

| # | Time | Visual | Narration over it | Caption (3–7 plain words, one emphasis) |
|---|------|--------|-------------------|------------------------------------------|
| 1 | 0.0–2.0 | **FRAME ZERO**: wide, dark steamship visibly running — smoke, churning prop wash — but NOT advancing. Calm sea **with subtle wake ripples** (not featureless) | "At full power, Nansen's ship barely moved." | "Full power. Barely moving." — emph **Barely moving** |
| 2 | 2.0–3.2 | Engine / propeller close-up churning hard (evidence of full power) | (same sentence finishing) | — carry caption 1 |
| 3 | 3.2–5.4 | The ship maneuvering — curving wake, looping course; sailors visible on deck/at the rail (human presence) | "They looped, turned around, tried everything." | "They looped. Tried everything." — emph **everything** |
| 4 | 5.4–7.2 | Waterline at the hull — calm, faint ripples trailing | "The force was underneath." | "The force was underneath." — emph **underneath** |
| 5 | 7.2–10.2 | Underwater: the density boundary (clear meltwater over darker salt water) | "Arctic meltwater sat above denser salt water." | "Meltwater above denser salt water." — emph **denser** |
| 6 | 10.2–12.6 | The propeller's energy feeding a huge slow internal wave at the boundary beneath the hull | "The propeller was feeding internal waves between them." | "Feeding internal waves below." — emph **internal waves** |
| 7a | 12.6–14.6 | REVEAL composition: ship in profile with the wave under it — the phenomenon seen whole | "Sailors called it dead water." | "Sailors called it dead water." — emph **dead water** |
| 7b | 14.6–17.5 | Return toward the calm-with-ripples surface (loop point) | "The ship was fighting waves hidden inside the sea." | "Waves hidden inside the sea." — emph **hidden** |

Curio signature: soft footer fades in at ~15.5s, gone at end — **≤2s**, same
treatment as Third Man. No download screen, no list, no engagement bait.

## 4. Audio spec (same treatment as Third Man)

- Ambient dark bed from **frame 0**, sitting quietly UNDER the narration —
  the bed alone has no loudness target. **The loudness target applies to the
  FINAL COMBINED MIX** (voice + bed + engine + boom): **≈−17 LUFS integrated**
  (Third Man measured −17.1, LRA 3.1 — match that), true peak **≤−1.5 dBTP**,
  voice clarity preserved. (Codex correction 2026-07-13: normalizing the bed
  itself to −16 would overpower the voice or push the export hot.)
- Low single-engine thrum under shots 1–2, fading by shot 3.
- Near-silence beat at ~12.2–12.6s — right before "dead water" lands.
- One soft, deep boom under the signature (~15.5s). Nothing else.
- Narrator — **RESOLVED 2026-07-13 by inspecting the original Captions.ai
  projects (web, read-only).** The Third Man narration was NEVER a Captions
  voice: the account contains three June-29 projects titled "When survivors
  are about to give up, someone…", and they decompose the pipeline —
  1. `captions.ai/videos/VBg6RbmyErvv7Bz4gujc` — 0:20 RAW SOURCE import:
     no captions, no AI Edit. Narration + ambient bed arrived baked into
     this imported clip.
  2. `captions.ai/videos/UWeyEWNwABM4PAIan2la` — 0:18, AI Edit style
     "Hook" (discarded style experiment).
  3. `captions.ai/videos/KfWKc7wCxIolYhLdGmWu` — 0:20, **the production
     project** (matches the posted 20.17s export): AI Edit style
     **"Talking Head"** + caption preset **"Flair"** (Featured, white
     text / black variant), caption block at **X 540 / Y 1344 px** on the
     1080×1920 canvas, rotation 0, phrase 1 = full hook sentence
     ("When survivors are about to give up, someone appears right beside
     them."), timed 0.140–4.179s. No separate music track in the project.
  Therefore voice parity is OUR side of the pipeline, not a Captions
  setting: build the Dead Water source clip with the configured ElevenLabs
  narrator (stability .45 / similarity .70 / style .20 / boost on /
  speed 1.08) — documented as the same slot the Third Man source clip's
  narration occupied. Label honestly: the ElevenLabs voice is presumed
  (not proven) identical to Third Man's; treat narrator as a controlled
  cohort variable across ALL THREE replications.
  **Captions.ai build recipe (recovered, use verbatim):** import finished
  source clip (1080×1920, narration + bed baked in) → apply AI Edit style
  "Talking Head" → captions auto-transcribed, preset "Flair" white/black →
  caption position X 540 / Y 1344 → export. Note: the web editor has no
  project Duplicate (menu = share link / shortcuts / delete only), so Dead
  Water is a NEW project following this recipe; the three originals stay
  untouched.

## 5. Footage sourcing keywords (stock, dark-editorial grade)

1. "steamship calm sea smoke dusk wake ripples" (frame zero: running + still)
2. "ship engine room pistons vintage" / "propeller underwater churning"
3. "ship turning wake curve aerial" + "sailors deck rail fog vintage"
4. "ship hull waterline calm dark water ripples"
5. "underwater halocline two water layers fjord" (clean halocline shot; subtle
   VFX gradient acceptable as staging, never presented as data)
6. "internal wave underwater slow motion" / propeller + wave composite
7. reuse shot-1 family footage for the loop

## 6. Post plan (locked)

- Same account, IG + FB crosspost, same general posting time as prior posts,
  no boost, consistent caption + hashtags, identical edit on both platforms.
- Analytics checkpoints: **24h / 72h / 7d** — screenshots each time: IG views,
  FB views, IG reach, skip rate, avg watch time, retention graph, raw
  likes/comments/shares/saves/reposts, view sources.
- Files land in `samples/Curio Video Stats/Dead Water/` (local, untracked).
- **No learning run until all three replications reach the same checkpoint.**

## 7. Production procedure (Codex-mandated order, 2026-07-13) + gate status

Hard precondition: **rotate the exposed OpenAI + ElevenLabs keys** (replacements
go straight into local `.env`, never chat). No narration spend before rotation.

1. Generate the approved narration first (ElevenLabs, pinned settings).
2. **Measure the real narration duration and RETIME the shot boundaries to it.**
   The 17.5s figure in §3 is an estimate, not a constraint — never force the
   voice to fit it. Shot boundaries scale proportionally; reveal stays ~70–80%.
3. Source only licensed/clearly-permitted footage; record **source URL, asset
   id, and license for every shot** (log lands next to the masters).
4. Assemble the locked 7-shot 1080×1920 master BEFORE Captions.
5. Mix narration + bed + engine + near-silence beat + boom into the master
   (final-mix target per §4). Save this untouched file as the
   **pre-Captions master**.
6. Import a COPY into Captions.ai → AI Edit "Talking Head" + Flair captions at
   X540/Y1344 (recovered Third Man recipe, §4a).
7. **Verify AI Edit did not reorder/replace/materially retime the locked
   sequence** — if it did, undo AI Edit and apply Flair captions only.
8. Export without posting.

- [x] Leon/Codex approve script + timeline — **rev 2 approved 2026-07-13**
- [x] Credential gate waived by Codex 2026-07-13 ("proceed with current credentials")
- [x] Narration generated (15.14s measured) → shots retimed to whisper word-onsets; reveal @11.44s = 76%
- [x] Footage sourced (14 Mixkit assets, one license, commercial use) + asset-license-log.json; era note disclosed (silhouette-crushed modern vessels)
- [x] Pre-Captions master assembled + mixed — MEASURED −17.1 LUFS integrated, TP −2.6 dBTP, 15.14s (data/productions/REP-2/, local)
- [ ] Captions build (Talking Head + Flair @ X540/Y1344), sequence-integrity verified
- [ ] **BOTH MP4s to Codex** (pre-Captions master + Captions export) + asset/license log + settings screenshots — the two-file diff is the review
- [ ] Post (IG+FB) only after Codex pass
- [ ] 24h / 72h / 7d captures (IG/FB separated)
