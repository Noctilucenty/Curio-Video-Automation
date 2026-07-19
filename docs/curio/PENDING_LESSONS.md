# PENDING LESSONS — recorded, NOT promoted

Observations awaiting a passing gate before they enter PRODUCTION_DOCTRINE.
Recording is NOT promotion (evidence discipline, CLAUDE.md). Each entry names the
gate that would promote it.

## 2026-07-19 — BRINE-POOL v5 creative REJECTION (Codex)

Recorded verdict: **v5 = technical PASS / creative REJECTED.** Promotion of
everything below is blocked until v6 passes the audio gate AND an audiovisual
loop x3 audition.

**P-1. A clean endpoint is not a behavioral loop.** v5 achieved SSIM 0.95 between
endpoints, caption clearance, and a matched seam — and still did not make anyone
replay it. SSIM measures appearance; replay is driven by SEMANTIC DEPENDENCY. v5's
last line ("life thrives along their edges") did not set up its first line. The v6
fix is a script-level hook — "And the impossible part?" — answered only by the
opening line. *Gate: v6 loop x3 audition.*

**P-2. Optimizing for a downstream TOOL can destroy an upstream CREATIVE property —
measure the property after every tool-driven change.** I inserted 1.82s of sentence
pauses purely so Captions.ai's pause-splitter would land on sentences (doctrine 52),
and never re-measured cadence. Effective WPM fell 145.9 -> 128. The doctrine-52 fix
was correct for captions and wrong for the video. **Any change made to satisfy a
tool must be re-scored against the three gates before it ships.** *Gate: v6 cadence
accepted.*

**P-3. Effective WPM (words / TOTAL runtime incl. pauses) is the cadence metric —
not raw speech rate.** v5's read was 145.9 WPM but the FILE was 128. Track the file
number. *Gate: v6 cadence accepted.*

**P-4. eleven_v3 `voice_settings.speed` is accepted by the API but has no effect.**
TESTED 2026-07-19, not assumed: speed None -> 15.57s, 1.08 -> 16.13s, 1.14 -> 16.37s
(higher speed = slower read; the variance is generation noise). Word count and gap
surgery are the only pace levers. *Gate: none needed — this is a measured API fact,
promote on next doctrine pass.*

**P-5. LRA is the wrong flatness instrument for <20s narration.** EBU LRA uses 3s
short-term windows and 10th/95th percentiles; a 15.4s file yields ~13 windows and
smears sub-second dynamics completely. BRINE v6 measures LRA 2.3 while carrying a
26.9 dB beat-level spread including a 5 dB pre-reveal collapse. Use a **400ms
beat-level contour** to judge emotional shape; keep LRA only as a coarse guard.
*Gate: confirm on listening that v6 does not read as flat.*

**P-6. A loop seam level-match target can conflict with loop MOTIVATION.** The
standing <=4 dB seam rule assumes an invisible ambient loop. An architecture where
an unresolved rise resolves INTO an opening hit requires a deliberate step (v6: 6.6
dB). Flag deliberate rule deviations for review; do not silently rewrite the rule.
*Gate: Codex ruling on the v6 seam.*

**P-7. Tail-only change => splice, never re-upload to Captions.ai** (its ASR has
corrupted a fact once). Carried forward from the v5 round; still unpromoted because
v5 was rejected downstream. *Gate: v6 caption pass.*

## 2026-07-19 (later) — v6.1 audio round: four defects found by measurement

**P-8. Seam-match BEFORE loudnorm is worthless.** v6.0 matched the loop seam on the
raw mix; loudnorm's time-varying gain then broke it -> 0.106 sample discontinuity =
an audible CLICK on every restart, in the exact build whose purpose is replay.
Do seam work AFTER normalisation. *Gate: v6 loop audition.*

**P-9. A level STEP and a CLICK are different things — do not fix one with the other.**
First attempt used a 0.10s equal-power blend, which dragged the opening hit into the
tail and flattened the deliberate rise->hit step from +6.6 dB to +1.9 dB. A click is
an INSTANTANEOUS sample jump; match the boundary samples only (4ms), and the step
survives. Final: step +7.8 dB, boundary jump 0.000000.

**P-10. Total RMS cannot show a bed build — the narrator dominates it.** Chasing a
"rising danger section" in the mixed contour was measuring the wrong signal: the
narrator's own diminuendo into the collapse sets the shape. Render a BED STEM and
judge the layer you actually control. Bed built +7.8 dB while total moved +0.2 dB.
*Gate: listening confirmation.*

**P-11. An adaptive duck GOVERNS the final ratio — tune the duck, not the sources.**
With a voice-priority duck active, cutting the drone 4 dB and a transient 4 dB moved
measured V/B by 0.3 dB: the duck simply attenuated less. Set the target in the duck
(headroom), and expect ~2 dB of lag from the envelope+smoothing (10 dB target ->
~8 dB measured). ALSO: exempt silence AFTER smoothing, never before — doing it before
let the smoother drag attenuation into the breath and crushed the closing rise
(seam +17.9 dB instead of +7.8).

**P-12. Judge masking DURING SPOKEN WORDS, not on beat averages.** Beat-mean V/B
included inter-word gaps and read -2.6 dB (alarming) where word-interval V/B read
+5.7 dB (marginal). Same audio, opposite conclusions. Word-interval V/B >= 6 dB is
the intelligibility gate, and it protects the QUALIFIER words specifically ("can
suffocate" was the tightest beat at 6.7 dB).

**P-13. Verify that a scripted edit actually matched before reporting it.** A
str.replace whose pattern did not match printed a success message anyway; I reported
an event as "moved out of the formant band" when the file was unchanged. Assert the
replacement changed the file. (This is doctrine 45 tool-honesty in string form.)
