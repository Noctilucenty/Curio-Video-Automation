# ANT-MILL — AUDIO GATE (awaiting Leon/Codex ear review)

**HARD STOP. No footage acquisition, no visual production until this passes.**
BRINE-POOL remains POSTED + FROZEN; this is a separate production.

## Deliverables
| # | artifact | file |
|---|---|---|
| 1 | selected narration | `ant-narration-C.mp3` |
| 2 | full audio story | `ant-audiostory-final.mp3` |
| 3 | loop x3 | `ant-audiostory-loopx3.mp3` |
| 3b | loop x2 | `ant-audiostory-loopx2.mp3` |
| 4 | word timings + measurements | `ant-timings.json` |

## Take selection — 3 takes, one continuous generation each, `speed` NOT sent
| take | stab | total | eff. WPM | collapse before "ant mill" | F0 body→close | close |
|---|---|---|---|---|---|---|
| A | 0.5 | 15.175s | 174.0 | 0.705s | 132.2→127.3 Hz | flat/falls |
| B | 0.5 | 16.612s | 158.9 | 0.347s | 129.4→129.0 Hz | flat/falls |
| C **← SELECTED** | 0.0 | 15.255s | 173.1 | 0.387s | 124.7→139.9 Hz | RISES |

**C selected.** It is the only take that satisfies *all* of: runtime in band, WPM in band,
the deliberate collapse landing **organically at 0.387s** (dead centre of the 0.30–0.40
spec), and — decisively — a closing fragment that **RISES** (124.7 → 139.9 Hz). A and B
both fall or stay flat, which would break the mandatory unresolved loop.
**Transcript QA (`gpt-4o-transcribe`): A and C are both WORD-PERFECT** against the locked
script, so accuracy did not separate them; the rising close did.

*Honest limit:* I cannot listen. Selection rests on cadence, gap structure, F0 contour and
transcript accuracy. An ear check on C vs A is still owed — that is what this gate is for.

## Measurements
| check | value | spec |
|---|---|---|
| runtime | **15.255s** | 14.5–16.5 ✓ |
| effective WPM (incl. pauses) | **173.1** | 165–175 ✓ |
| pre-reveal collapse | **0.387s** | 0.30–0.40 ✓ |
| tail after final word | **0.000s** | no bed-only tail ✓ |
| integrated loudness | **−16.3 LUFS** | ✓ |
| true peak | **−6.0 dBFS** | ≤ −1.5 ✓ |
| LRA | 2.5 LU | — |
| loop boundary jump | **0.000000** both channels | no click ✓ |
| restart step | **+10.1 dB** | deliberate rise→hit resolution |
| mono fold-down loss | **0.0 dB** | amplitude panning, no cancellation ✓ |
| V/B during spoken words | **9.8–10.7 dB** | ≥6 ✓ |
| bed at collapse | **−83.9 dB** vs −26.1 surrounding | true collapse ✓ |

**Ant-rustle densification (onsets/sec — RMS is the wrong instrument here):**
opening 13.0 → separation 24.8 → loop strengthens 27.0 → **COLLAPSE 0.0** →
name reveal 20.7 → exhaustion 34.8 → closing 37.6. ~2.9× density build with a total
dropout at the reveal.

## GAP RULING — RESOLVED (Codex, 2026-07-20): keep Take C UNTRIMMED
The <=0.18s rule applies to **ordinary gaps, not deliberate narrative pivots.**
| gap | duration | classification |
|---|---|---|
| before "ant mill" | 0.387s | designed reveal collapse |
| after "ant mill" | 0.425s | reveal landing |
| after "exhaustion" | 0.625s | designed setup for the semantic-loop fragment |
| after "no leader" | 0.670s | **PROVISIONAL RISK — do not trim yet** |

The 0.670s sits inside the first four seconds. It survives ONLY if the low-res preview
shows a visible **trail-separation / circle-closing state change** plus an audible
transition inside it. If the preview stalls there, trim **ONLY this gap** toward ~0.40s
and accept the small WPM deviation. Never re-trim every pause.
**Do not regenerate the narration. Do not mechanically trim all gaps.**

## RESTART STEP — EAR GATE, NOT AN AUTOMATIC PASS
+10.1 dB is preserved only if Leon hears it as a satisfying re-hook. If it reads as a
volume jump, reduce **only the restart step** to ~6-7 dB, keeping zero sample
discontinuity and the unresolved semantic loop.

## (superseded) original open question
Codex specifies ordinary gaps **≤0.18s**. Take C has three above it:
after `leader.` 0.670s · after `mill.` 0.425s · after `exhaustion.` 0.625s.

**Enforcing the rule breaks both headline targets**, because word count is fixed at 44:

| action | runtime | WPM |
|---|---|---|
| **C untrimmed (shipped)** | **15.255s ✓** | **173.1 ✓** |
| trim all to 0.18s | 14.075s ✗ | 187.6 ✗ |
| partial trim | 14.455s ✗ | 182.6 ✗ |
| light trim | 14.755s ✗ | 178.9 ✗ |

Any trim pushes WPM above the 175 ceiling and runtime below the 14.5s floor. C untrimmed
is the **only** state satisfying both. I shipped it untrimmed and am flagging the
deviation rather than silently breaking spec or silently ignoring the gap rule.
Dramatically those three pauses sit after "no leader", after the name reveal, and before
the closing fragment — all load-bearing beats. **Your ruling.**

## Fact compliance
Conditional wording preserved throughout: "**can** circle onto their own scent trail",
"the circle **can** continue". No claim that every circular group inevitably dies. No
blindness claim. Self-organisation stated via "there is no leader".

## NEXT — blocked until this gate passes
Real ant-mill footage only. **No Veo, no AI ants, no simulated footage, no viral-clip
downloads.** If no genuine licensed mill clip can be sourced, I stop and report options
and costs rather than manufacturing a fake.

---

## VISUAL PREVIEW ROUND (2026-07-20) — awaiting eye+ear approval

**Footage: Veo 3.1, 8 clips generated (SCOPED EXCEPTION, ANT-MILL only — NOT documentary
footage; AI disclosure mandatory downstream).** Low-res audiovisual preview built:
`ant-preview-lowres.mp4` (540x960, 15.255s) + `ant-preview-loopx3.mp4`.

### Footage verdicts (frame-inspected)
| shot | verdict |
|---|---|
| s1-circle | ✅ closed rotating ring, empty centre — frame zero + return |
| s2-follow | ✅ real anatomy at full res (6 legs, antennae, following); use 0.4-2.0s |
| s3-separate | ✅ column with a group peeling off |
| **s4-bend** | ❌ **v1 is an inward SPIRAL (filled centre) — scientifically wrong. Re-prompt queued (torus, empty centre); credits depleted before it landed.** |
| s5-close | ✅ cleanest torus, empty centre; carries the collapse beat |
| **s6-dense** | ❌ spiral again — **DROPPED, not re-generated** (s7-mill already delivers the dense state correctly) |
| s7-mill | ✅ excellent wide mill — reveal + density-held beat |
| s8-exhaust | ✅ thinned ragged ring, sombre, correct anatomy |

### Preview findings
- **0.670s "no leader" pause — PASSES.** s1->s2 cut lands at f99 inside the pause
  (f92-f112); ring -> individual-following with continuous motion, no stall. **Keep
  untrimmed per the ruling.**
- Close follow shot survives full-res anatomy inspection.
- Beats align to audio anchors (wide mill under "ant mill"; exhaustion under "collapse").
- **Loop: composition returns to the opening ring, but pixel SSIM only 0.509** (live
  footage rotates, so pixel-match is impossible). Behavioural-loop quality is an
  EYE+EAR judgment — that is what this gate is for.

### BLOCKERS before full-res assembly
1. **s4-bend torus re-shoot** (or bridge B4 by extending s3/s5) — currently a spiral.
2. **Eye+ear approval of the loop** (Codex: "validate with an actual loop x3 audition").
3. Restart step +10.1 dB still an ear gate (reduce to 6-7 dB if it jumps).

**HARD STOP: no full-res grade / 60fps / captions until the loop is approved and s4-bend
is fixed.** Captions.ai remains the outer boundary — not reached.
