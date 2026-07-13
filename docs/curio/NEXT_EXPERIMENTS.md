# Next experiments (priority order, 2026-07-12)

The single highest-value question right now: **is "atmospheric survival mystery
with immediate visual evidence" a real archetype, or was Third Man a fluke?**
Three disciplined replications answer it. Each keeps the WINNING MECHANISM and
changes only the subject. If all three beat the current baseline (skip < ~55%,
any nonzero shares/saves), the archetype gets promoted CONFIRMED and lands in
approved-patterns.json.

**The mechanism being replicated** (from EXP-202606-30-01, all five together):
1. Immediate physical anomaly ON SCREEN at t=0 (evidence before explanation)
2. Survival or danger context in the first sentence
3. Human presence (even a distant silhouette)
4. Named explanation at ~70–80% of runtime
5. Residual mystery — the name does not fully close the question
plus: 15–20s runtime, escalating imagery per evidence beat, ≤2s soft signature,
bed at −16 LUFS (the render gate enforces it).

Every experiment must be captured per docs/curio/ANALYTICS_CAPTURE_TEMPLATE.md
(IG and FB views SEPARATED — non-negotiable).

**One-outcome declaration (Leon 2026-07-12, applies to every experiment
below):** primary outcome = **retention**, secondary = **shares**
(send-to-someone on the survival stakes). The outcome moment for each REP is
its named-explanation beat at ~70–80% — the delayed payoff the whole open loop
exists for. Do NOT bolt on save bait, comment bait, or extra tactics: comments
may emerge from the residual mystery on their own, and that's the only
acceptable source. Success is judged against the declared outcome (skip rate /
avg watch), not against likes.

---

## REP-1 — Paradoxical undressing (hypothermia)

- Verified basis: well-documented in forensic medicine — 20–50% of lethal
  hypothermia cases are found partially or fully undressed ("paradoxical
  undressing"; often with terminal burrowing, "hide-and-die syndrome").
- t=0 anomaly: clothes scattered across snow, footprints leading away.
- Hook: "Rescuers keep finding them the same way: undressed in the snow… by
  their own hands."
- Stakes: freezing to death, alone.
- Human presence: a distant figure stumbling in a whiteout.
- Escalation: scattered garments → single trail of footprints → figure in the
  blizzard → shelter hollow in the snow.
- Named reveal (~75%): "Doctors call it paradoxical undressing." (cold-shocked
  blood vessels re-dilate; the freezing brain feels unbearable heat)
- Residual mystery: "In the final minutes, the body swears it is burning."
  Why so many also hide themselves before the end is still debated.

## REP-2 — Dead water (Nansen, 1893)

- Verified basis: Fridtjof Nansen's Fram log, 1893; explained by V. W. Ekman
  (1904) — internal waves at a fresh/salt water boundary.
- t=0 anomaly: a ship at full power, dead still on a mirror-calm sea.
- Hook: "The engines ran at full power. The ship refused to move."
- Stakes: trapped in the Arctic, no wind, no current, no explanation.
- Human presence: sailors at the rail staring at still water.
- Escalation: straining engine → glassy sea → crew checking the hull → nothing
  visible below → the invisible layer revealed as a diagram-like underwater shot.
- Named reveal (~75%): "Sailors called it dead water." (an invisible internal
  wave under the surface swallows the ship's energy)
- Residual mystery: "The sea can hold a ship without ever showing its hand" —
  and for eleven years nobody could say how.

## REP-3 — Shallow-water blackout (freediving)

- Verified basis: well-documented physiology — hypocapnia from
  hyperventilation suppresses the urge to breathe; divers lose consciousness
  on ascent with air still in their tanks/lungs.
- t=0 anomaly: a diver found on the pool floor — calm, no struggle, air remaining.
- Hook: "Strong swimmers keep drowning in water they could stand up in."
- Stakes: it happens silently, in seconds, without a single splash.
- Human presence: a swimmer gliding, then perfectly still.
- Escalation: calm surface → swimmer underwater → the exhale that never comes →
  stillness → measured facts (no warning, no panic reflex).
- Named reveal (~75%): "It's called shallow-water blackout." (the brain's
  low-oxygen alarm never fires — CO2, not oxygen, triggers the urge to breathe)
- Residual mystery: "The body has an alarm for drowning. It just doesn't
  always ring."

---

## AB-1 — Rescue "Can't Forget Anything" (controlled hook test)

Keep IDENTICAL: footage concept, narration voice, duration, audio, ending.
Change ONLY the first 3 seconds. Requirement: no generic brain imagery in the
opening frame — open on a person.

- Variant A (original framing): "What if you could never forget anything?"
- Variant B (immediate human cost): "She remembers every day of her life.
  That's the problem."

Tests: abstract aspiration vs immediate human cost. The topic already showed
save/share pull (1.6% each, 23.6% Explore) — the opening was the leak.

## AB-2 — Boat done properly (controlled hook test)

ONE 14–16s cut. Anomalous ship visible at t=0. False-horizon explanation lands
by ~8–10s. NO extended product card. Vary only the hook:

- Variant A: "Sailors once saw ships floating in the sky."
- Variant B: "This ship isn't flying. The horizon is lying."

---

## Discipline notes

- One variable per A/B. The Boat Retry failure (5 variables at once, all
  signals worse, zero attributable cause) is the cautionary entry in the ledger.
- Pin the model snapshot (OPENAI_MODEL=<exact gpt-5.6 snapshot id>) for the
  duration of a cohort so a silent model update can't contaminate it.
- Compare within archetype, against the Third Man baseline: skip 38.6%,
  watch ratio 59.5%, 240 IG views / 165 reached, 16 likes (6.7% of IG views),
  shares/saves/comments/reposts all ≥2 raw. Compare on the IG stream only.
- Static cards stay FROZEN until this narrative baseline exists.
