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

## 2026-07-19 — v7 visual round

**P-14. iCloud eviction CORRUPTS RENDERS MID-RUN — build outside iCloud. (PROMOTE
IMMEDIATELY, infrastructure not creative.)** The v7 mux died with "Invalid data found
when processing input" on the locked WAV; probing the same file seconds later showed
it perfectly valid. Cause: iCloud evicted it between open and read. 40 files in
BRINE-POOL were dataless at the time, including the SELECTED narration take and 3 of
the 7 plates the assemble needed — with 15 GB free, so this is not a disk-full edge
case.
- Detect with `os.stat().st_flags & 0x40000000` (or `st_blocks == 0`), NOT `find -flags`.
- **`brctl download` silently fails to materialise some files** — 3 plates stayed
  dataless after it returned. A full read (`cat f > /dev/null`) forced them resident.
- **The fix that actually works: copy inputs to a non-iCloud scratch dir and render
  there**, then copy the master back. Renders are long enough that mid-run eviction is
  likely whenever the folder is under iCloud pressure.
- **A failed step earlier in a chained command can leave a STALE output that the next
  step then "verifies".** The QA in that same run reported on the previous 461f build
  and printed a FAIL that had nothing to do with the new audio. Never read a QA result
  without confirming the artefact's mtime/duration matches the build you just made.

**P-15. Codex's collapse spec and doctrine #8's automated check were arithmetically
incompatible.** finalqa requires >=0.35s under -35 dB; Codex specified a 0.30-0.40s
collapse; ramp edges consume ~0.05-0.07s, so a 0.344s gap can never satisfy both.
Resolved WITHOUT loosening the gate: took the collapse to Codex's stated maximum
(0.400s) and reclaimed the time from the ordinary gap (0.12s -> 0.072s) so effective
WPM still lands exactly on the 160 floor. Lesson: when a code gate and a reviewer
spec conflict, look for the value that satisfies both before proposing either change.


**P-16. Captions.ai: NEVER click a word chip by coordinate — the row re-scrolls after
every selection.** Applying page breaks, I clicked what I believed was "pools," and the
row had shifted; I renamed **"suffocate." -> "pools."**, corrupting the caption to
"Animals entering can pools." Caught it on the next screenshot and reverted with Undo.
The word chips move after each selection because selecting re-centres the playhead.
**Procedure: screenshot IMMEDIATELY before every word click, confirm the target chip's
coordinates in THAT screenshot, and verify the Word panel's text field shows the
expected word BEFORE typing.** The panel's text field is the confirmation signal — it
names the word you actually have.

**P-17. The Phrase-panel textarea edit does NOT persist.** Editing ", yet" -> ". Yet"
in the Phrase text box appeared to work (verified by zoom), but reopening the panel
showed the original text and the word chips never changed. Only the WORD panel's text
field commits. Do not trust the Phrase textarea for corrections.

## 2026-07-19 — Captions.ai UI model (Leon corrected me in-session)

**P-18. Captions.ai has TWO EDIT SCOPES and they are entered differently. Using the
wrong entry point silently switches the project's STYLE.**
- **WORD scope** — click the word chip in the caption track. Opens the **Word** panel:
  editable text field, Breaks (None/Auto/Line Break/Page Break), Focus
  (Supersize/Emphasize/Underline), Delete word.
- **GLOBAL scope** — **click OUTSIDE first to DESELECT**, *then* click **Captions
  style** (2nd icon, left sidebar). Opens the style editor with tabs
  **Captions | Paragraph | Active word | Emphasize**.
- **THE TRAP:** opening Captions style while a word/phrase is still SELECTED opened
  the editor on the WRONG style (**Chronicle**) and switched the video to it — the
  preview flipped to a serif font and cards re-flowed to ~1 word each.
  **`Cancel` did NOT revert the switch.** Verify the panel header names the intended
  style BEFORE touching any field, and re-verify the preview font after closing.
- Doctrine 55.6 already warned that clicking a style CARD BODY switches style; this is
  the same hazard reached through a different door. Sidebar entry requires deselect-first.

**P-19. Reference: Paragraph tab values actually observed (do not guess these).**
| field | Nova (ours) | Chronicle |
|---|---|---|
| Words per line | 0 -> **2** (we set) | 1 |
| Pause seconds | 0.40 | 0.40 |
| Character count | 10 | 8 |
| Split seconds | 0 | 0 |
| Lines per page | 3 | 2 |
| Page breaks | 3 | 2 |
| Max lines | 0 | 0 |
| Autofit | off | off |
| Hide punctuation | off | **ON** |
| Alignment | **Random** | Center |

**`Pause seconds = 0.40` is the splitter threshold — this is the root cause of the
cross-sentence cards.** BRINE v7's ordinary word gaps are <=0.12s and the ONLY 0.40s
gap is the deliberate pre-reveal collapse, so the splitter could fire in exactly one
place in the whole video. Either (a) set explicit per-word Page Breaks, or (b) lower
Pause seconds below the VO's real inter-sentence gap. Measure the VO's gaps FIRST and
set this number from them — do not accept the default.

**P-20. `Words per line` is the cheap global lever the per-word grind was substituting
for.** Setting it to 2 fixed the hook card in one action ("And the / impossible part?"
as one complete card) after I had spent many per-word clicks. **Check the GLOBAL
Paragraph tab BEFORE doing any per-word Break work** — per-word breaks are for
exceptions, not for the base layout.

**P-21. An export renders WHATEVER STATE THE PROJECT IS IN.** A Download triggered
while the project had silently flipped to Chronicle began rendering Chronicle, not
Nova. **Confirm style + a sample caption frame in the preview immediately before
pressing Download**, and discard any export whose provenance you cannot vouch for.

**P-22. `Alignment: Random` is a live retention question, unresolved.** Nova ships with
Random, so caption blocks jump position between cards. A stable centre is easier to
read at feed speed, but changing it alters an approved style's intended look — flag to
Leon/Codex rather than changing it unilaterally.

**P-23. Re-selecting a style RESETS its style-level settings to the stock preset.**
After the accidental Chronicle switch, restoring Nova from the style library wiped
`Words per line = 2` back to Nova's stock `0` — confirmed by reopening the Paragraph
tab. **Per-word Breaks SURVIVED** (they are stored on the words, not the style).
So the two layers have different persistence:
  - WORD layer (text edits, Breaks, Focus) — survives a style change
  - STYLE layer (Paragraph: words per line, pause seconds, alignment, ...) — RESET
**After ANY style change, re-open Paragraph and re-apply every style-level value**,
then verify on a rendered caption card, not on the field.

**P-24. Selecting a style card requires the underlying control, not the card artwork.**
Clicking the card body at pixel centre did nothing (no selection border, Apply stayed
disabled). `read_page` exposed the real control (`ref_59`, with `ref_60` = "Edit Nova")
and clicking THAT selected it and enabled Apply. When a click visibly does nothing in
this app, read_page for the element rather than retrying coordinates.

**P-25 (META, Leon 2026-07-19). BRINE-POOL was the most human-corrected build to date —
treat its correction list as the engine's highest-value training data.** Human/reviewer
interventions that the autopilot did NOT self-catch, in order:
  1. Codex: v5 cadence + behavioural loop NO-GO (128 WPM; clean seam != replay motive)
  2. Codex: the 0-8.4s danger section was objectively uniform -> event-driven progression
  3. Leon: the GLOBAL Paragraph panel existed the whole time (deselect -> Captions style)
     while I ground through per-word breaks
  4. Leon: correct entry points for word-scope vs global-scope editing
Pattern across all four: **I optimised locally and missed the global control or the
global consequence.** Standing correction — before any repetitive manual pass, ask
"is there a global setting for this?", and after any tool-driven change, re-score the
three gates. Every one of these cost a full rebuild cycle.

**P-26. `Words per line = 2` FRAGMENTS SENTENCES AND BREAKS THE QUALIFIER GATE.
Verified on exported frames — REVERT IT for narration-style scripts.**
Applied to BRINE v7 and exported, the frames show:
  - **1.80s renders "are deadly." with "Some" stranded on the previous card.** The
    caption therefore asserts brine lakes ARE deadly, dropping the source hedge. This
    is a doctrine #44/#50 QUALIFIER-GATE VIOLATION produced purely by a layout setting.
    **A line-break setting can strip a qualifier. Re-run the qualifier gate on the
    EXPORTED FRAMES after any caption-layout change — checking the transcript is not
    enough, because the transcript was correct.**
  - 6.17s renders "salt it" — a meaningless fragment.
  - 11.30s renders "brine pools." with "They're called" on the prior card, weakening
    the reveal.
  - The opening premise now completes at **1.00s** ("The ocean" -> "The ocean has
    lakes.") versus **0.10s** with v5's one-line hook — a 0.9s comprehension loss on
    the single most important card.
**Conclusion:** 2-words-per-line suits punchy talking-head copy, NOT continuous
narration with hedged clauses. For Curio narration keep `Words per line = 0` and get
sentence alignment from per-word **Page Breaks** (which survive style changes, P-23).

**P-27. Caption lingers over the engineered collapse.** "Animals entering can
suffocate." is still on screen at 9.95s AND 10.10s, covering the 0.400s pre-reveal
silence that the whole audio architecture was built around. The dramatic beat must be
caption-free — needs an explicit end-time or a page break landing before 9.85s.

**P-28. My ink-detector cropped the wrong band and reported the hook as "clean" and
the collapse as "CAPTION" — both misleading.** Nova's caption Y position moves
(Alignment: Random). NEVER trust a fixed-crop ink heuristic after a style/layout
change; render the contact sheet and READ THE FRAMES. I have now made this same
class of error twice (see the v4 false positives).

**P-26 CORRECTION (Codex, 2026-07-19) — my root-cause attribution was WRONG.**
I concluded "`Words per line = 2` fragments sentences and breaks the qualifier gate"
and recommended reverting to 0. **The setting was not the cause.** I tested
words-per-line=2 while `Character count` was still **10** and `Lines per page` **3** —
that combination is what stranded "Some" and produced "salt it".

Codex's verified configuration keeps 2 words per line and fixes the fragmentation with
the OTHER two fields:
```
Style: Nova | Words per line 2 | Lines per page 2 | Character count 22
Pause seconds 0.40 | Autofit Off | Alignment CENTER (not Random)
Paragraph-panel "Page breaks": 2 | no one-word pages
```
2 words/line x 2 lines = a 4-word card, so "The ocean has lakes." and "Some are
deadly." each land whole and the hedge stays attached.

**The generalisable error is mine and it is the important part: I changed ONE field,
observed a bad result, and blamed that field — while two other fields in the same
panel were still at values that made it fail.** Never attribute a defect to a single
setting when co-dependent settings in the same group are untested. Vary the GROUP, or
state the attribution as provisional. I recorded a confident, wrong rule that would
have removed a correct setting from the engine permanently.

**One-word-per-line is a HARD NO-GO** (Codex): the viewer must mentally assemble the
premise across flashes, "The ocean has lakes" never appears as one thought, and caption
turnover competes with the visuals.

**Word-level Page Breaks — 11 total** (first card starts automatically, needs none):
`Some · They · and · Their · dense · sinks · Animals · They're · Yet · along · And`
Plus the opening exception: `lakes.` -> **Breaks: None** so the complete four-word
premise appears immediately (one line preferred; two acceptable only if both lines
illuminate together).

**Target card list (12):** "The ocean has lakes." / "Some are deadly." / "They ripple" /
"and have shorelines." / "Their water is so" / "dense with salt it" / "sinks, barely
mixing." / "Animals entering can suffocate." / "They're called brine pools." / "Yet life
thrives" / "along their edges." / "And the impossible part?"

**P-29. `Alignment: Random` is RESOLVED — use CENTER.** Codex ruled it: stable
lower-centre placement. My earlier open question is closed; Nova's Random default is
overridden for Curio.

## 2026-07-19 — Harrison analytics SUPERSEDED (Facebook-native capture)

**P-30. I recorded mis-scoped dashboard metrics as settled fact, and doctrine was built
on them.** Claimed: "advocacy all zero", "stalled at 176 views". Facebook-native capture
shows **35.8K views, 15s avg watch, 56% completion, 99.3% of watch time from
Recommendations (~135x the Page's typical post), 4 shares + 8 saves.** Instagram-native
was **176 views / reach 113 / 1 like** — the "20 likes" I logged was not IG-only.
**Rule: label the SCOPE of every metric at capture time (platform-native vs combined
surface), and never promote a rule from a surface whose scope you have not confirmed.**
Advocacy is now WEAK (~0.03% of views), not absent — the gate still fails, but the
"all zero" framing is retracted.

**P-31. FB and IG tested DIFFERENT DEMOGRAPHICS, not merely different view definitions.**
FB **88% men, 45–64, US/UK-led**; IG **18–34**. Combining them averages two different
experiments on two different populations. This strengthens the existing
never-combine rule with a better reason.

**P-32. The "AI hand defects hurt watch behaviour" hypothesis is KILLED.** 56% completion
and 15s average watch WITH the visible defects present. Defects remain suspect ONLY for
the advocacy gap. **Consequence: do not spend build budget defending against a retention
risk that the data has ruled out — spend it on the transferable-fact ending**, which is
the actual lever on the failing gate.

**P-33. A page break can MASK a missing neighbouring break.** BRINE v7: I believed
`And` already had a page break. Adding the `along` break re-flowed the group and
produced a cross-sentence card — "along their / edges. And" — which is what finally
exposed that `And` had none. **After adding any page break, re-inspect the ADJACENT
cards on both sides**, because the new grouping can surface (or create) a defect that
the previous spill was hiding.

**P-34. Captions.ai Word panel access, confirmed procedure.** Single click on a word
chip = **Phrase** panel. **Double-click = Word** panel. The row re-scrolls on selection,
so a double-click frequently lands on a DIFFERENT word than intended (hit "edges." and
"impossible" while aiming for "along" and "And" in this session alone). **Always zoom
the Word panel's text field and confirm the word BEFORE clicking any Break button.**
This check has now prevented three wrong-word edits; skipping it once already corrupted
"suffocate." -> "pools.".

**P-35. RETRACTED: my "caption covers the engineered silence" finding was FALSE.**
Codex's independent 60fps check was right. Frame-verified: "Animals entering can
suffocate." is present at 9.83s and 9.85s and **BLANK from 9.87s**. Silence starts
9.852s → overlap is under one frame, inside the two-frame allowance. **v7 PASSES.**
My false reading came from a fixed-crop luminance threshold (>200) over the
`p6-animal-danger` plate, whose bright salt/sand rim exceeds the threshold with no text
present. **This is the THIRD time this detector class has produced a false positive
(see P-28, and the v4 round).**
**HARD RULE, no exceptions: a fixed-crop ink/luminance heuristic may NEVER be used to
assert caption presence or absence. Render the frames and read them.** The heuristic is
only admissible on a plate verified to be dark in that exact band, and even then only
as a pointer to frames worth looking at. I have now twice reported a defect that did not
exist and once missed one that did — the cost is reviewer time and false NO-GOs.

## 2026-07-19 — conversion layer + doc-integrity round

**P-36. A posting package is not complete until every link is REAL and PER-PLATFORM.**
My first package shipped "direct Curio link" as an instruction and one shared UTM. Codex
rejected it. **Placeholders and "insert link here" prose are not deliverables.** When the
destination is unknown, ASK — do not invent a plausible URL and do not ship a stub.
Destination is `https://trycurio.app`; each platform gets its own source/medium pair.

**P-37. Instagram wording must NOT be copy-pasted to Facebook.** FB's Reel description
field is guaranteed but external URLs there are not promised clickable, so "link in bio"
is wrong on Facebook. Use a verified FB link surface (Page CTA / Page bio) plus a
memorable short URL typed plainly. **Every platform gets its own publishing block** —
IG, FB, YouTube and TikTok copy are four artefacts, not one reused four times.

**P-38. AI-generated visuals require platform disclosure.** TikTok AI-generated-content
label + YouTube altered/synthetic-content disclosure are MANDATORY while plates are
generated. Both platforms state disclosure does not reduce distribution, so there is no
performance argument for omitting it. Add to every posting package by default.

**P-39. Same file hash across platforms is safe; watermarked re-uploads are not.** Upload
the ORIGINAL clean master natively everywhere — no re-export needed, order does not
matter. Never download a platform's compressed/watermarked copy to repost; Instagram
limits recommendation of visibly recycled content. Do not add or remove pixels merely to
change a hash — no benefit.

**P-40. Docs written into gitignored production dirs can vanish.** `POSTING-PACKAGE.md`
lives under `data/productions/` which is ignored. **Anything that must survive repo
cleanup gets mirrored into tracked docs** — and VERIFY with `git check-ignore` rather
than assuming. Mirror: `docs/curio/posting/`.

**P-41. A specific per-video ruling and a generic schedule table WILL disagree — record
the resolution, never leave both standing.** GROWTH_OS §2 said IG+FB 6:00 PM Sunday;
Codex ruled 6:30 PM PDT for BRINE-POOL v7. Both sat in the engine contradicting each
other until an audit caught it. **Precedence: the per-video ruling governs, and it must
be written back into the generic doc.** This is the living-document discipline applied
to schedules, not just rules.

**P-42. Completed work-in-progress files are a trap for future sessions.** `V7-STATE.md`
and `V7-CAPTION-STATE.md` still listed "STILL MISSING: Some · They · and · sinks" long
after those were applied and the video PASSED. A future session reading them would redo
finished work on a LOCKED master. **When work completes, bannerise the state file as
SUPERSEDED at the top — do not just leave it.**

## 2026-07-20 — ANT-MILL: I failed to apply my OWN doctrine to the next production

**P-43. A lesson recorded for production A is worthless unless it is APPLIED to
production B. Doctrine #56 (loop breath) was written by me after BRINE-POOL v4 — and
I then built ANT-MILL with `tail = 0.000s`, the exact defect #56 exists to prevent.**
Leon caught it, not me, and not any automated check.

Measured on the ANT-MILL v1 audio story:
- final word "follows…" ended at the **last sample** — its decay was cut off mid-ring
  (−29 dB still sounding at the cut)
- restart step **+12.7 dB @25ms / +10.1 dB @100ms** — an audible splice, not a loop
- I had reported "no bed-only tail ✓" as if 0.000s were a PASS. Codex's spec was
  "end-to-restart breath **≤0.15s**" — a ceiling, not a target of zero. **I read a
  maximum as a requirement to eliminate.**

Fix: 0.14s breath (inside Codex's cap) + let the unresolved rise and drone **crescendo
into** the opening hit so the restart reads as continuation rather than a jump.
Result: **−1.3 dB @25ms · −0.4 dB @50ms · +2.7 dB @100ms**, zero sample discontinuity,
bed continuing through the breath (−20.3 dB, not dead air), masking unchanged (10.1 dB),
loudness unchanged (−16.3 LUFS).

**Three generalisable rules:**
1. **Before locking any looping audio, re-read the loop doctrine and verify the breath
   EXISTS.** "No dead tail" never means "no tail".
2. **A spec written as `<= X` is a CEILING. Do not implement it as `= 0`.** Ask what the
   floor is; if none is stated, the floor is whatever makes the mechanism work.
3. **Measure the restart at ±25ms and ±50ms, not just ±100ms.** The perceptual splice
   lives in the first few tens of milliseconds; ±100ms averaging hid a +12.7 dB jump as
   "+10.1 dB, deliberate".

**Engine change that would have caught this:** the audio build must FAIL LOUD if
`total - last_word_end` is outside the loop-breath band, exactly as finalqa fails on
loudness. A silent 0.000s should never have printed as a tick.

**P-44. `finalqa`'s loop-continuity SSIM is calibrated for STILL-PLATE productions and is
the WRONG INSTRUMENT for live/motion footage. Do NOT loosen the threshold — add a
motion-based check instead.**
ANT-MILL (Veo live footage) scored blurred SSIM **0.635** against a 0.90 minimum and
"failed", while BRINE-POOL (static plates + zoompan) scored 0.97. The difference is not
loop quality: in live footage the subject keeps moving, so consecutive-but-different
frames can never pixel-match.

**The correct instrument is seam delta vs. in-shot motion delta:**
| measure | ANT-MILL |
|---|---|
| typical inter-frame delta inside a continuous shot | 15.87 (range 15.45–16.41) |
| **LOOP SEAM delta (last frame -> first frame)** | **16.38** |
| a real hard cut, for reference | 52.35 |
Seam ≈ normal motion, and ~1/3 of a cut => **the loop is perceptually invisible**.

**Technique that produced it:** make the return beat END at the exact instant of the
source clip where the opening beat BEGINS (same clip, contiguous timestamps). The
subject's motion then carries across the restart with no discontinuity at all — far
stronger than trying to pixel-match two distant moments of a moving shot.

**Engine change owed:** `finalqa` should detect motion content and apply the seam-vs-
motion test instead of SSIM, rather than emitting a FAIL that a human must overrule.
An overrulable check trains the operator to ignore failures — which is how a real defect
eventually ships. **Do not fix this by lowering 0.90.**
