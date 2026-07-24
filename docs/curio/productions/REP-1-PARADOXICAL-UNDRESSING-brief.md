# REP-1 — Paradoxical undressing

Status: **AUDIO-STORY REVIEW GATE, SCRIPT v3 (2026-07-23 evening).** Leon
flagged v1 comprehension ("not human easy understandable") — audit confirmed:
"vessels" ship-misparse + garden path, "garments" ear-register, "them"→doctors
antecedent trap on the share line. **Script v3 locked (49 words):** "Some
people… clothes… blood rushes back to the skin… **It's called** paradoxical
undressing. Nearly all of them crawl somewhere to hide first." The v2/v3
closing fell 0-for-6 in fresh takes while v1's identical closing rose 2-for-2,
so the narration master is take **S — a doctrine-30 splice** (v3 body from
take H + take A's +224.1 Hz rising closing line, joined in true silence;
full history in `data/productions/REP-1-UNDRESSING/AUDIO-LINEAGE.md`).
Audio story rebuilt on S and measured: 18.123 s, −17.1 LUFS, TP −3.1 dBTP,
collapse 0.361 s @84%, reveal 83.3%, loop join continuous (+3.6 dB @100 ms),
mux ASR word-perfect. **AUDIO STORY APPROVED — Leon, 2026-07-23 evening ("perfect… loved this one").
The pre-visual gate is PASSED; paid visual generation is now authorized.
Locked audio master: rep1-audiostory-final.wav (18.123 s, take S) — SHA in AUDIO-LINEAGE.md.**

Date: 2026-07-23 (Thursday)
Growth OS slot: psychology / named human phenomenon — **fits**
Category: survival · psychology (named phenomenon)
Target: ~18.7s including a 0.30s bed-only loop breath
Primary outcome: **retention** · Secondary: **shares**

## Why this, and not a trend topic

This is **REP-1 from `NEXT_EXPERIMENTS.md`** — the standing priority queue. The
highest-value open question is whether *"atmospheric survival mystery with
immediate visual evidence"* is a real archetype or whether Third Man was a
fluke. Three replications answer it; each keeps the winning mechanism and
changes only the subject. Today's vidIQ sweeps
(`2026-07-23-*.json`) are logged as **candidate trend notes only** and were
explicitly NOT allowed to redirect the build — external outliers never outrank
Curio's own confirmed results (CLAUDE.md evidence discipline).

The five replicated mechanism elements (EXP-202606-30-01):
1. Immediate physical anomaly on screen at t=0 — scattered clothing in snow
2. Survival/danger context in the first sentence — freezing to death
3. Human presence — a distant figure in the whiteout
4. Named explanation at ~70-80% — "paradoxical undressing"
5. Residual mystery — the name does not close the question

## LOCKED narration — script v3 (49 words; supersedes the v1 draft below)

> Some people freeze to death undressed. Rescuers find clothes scattered in
> the snow, a trail leading away. In the last stage of freezing, blood rushes
> back to the skin, and the body floods with false heat. It's called
> paradoxical undressing. Nearly all of them crawl somewhere to hide first.

Claim-map deltas vs v1 (all other rows unchanged): "clothes" = "garments"
(same claim, ear register); "blood rushes **back** to the skin" = the source's
peripheral vasodilatation in plain language, with "back" carrying the earlier
vasoconstriction; "It's called" = the same named phenomenon without the
"Doctors" plural that made the closing line's "them" garden-path.

### v1 draft (superseded 2026-07-23 — comprehension audit)

> Some freeze to death undressed. Rescuers find garments scattered in the snow,
> a trail leading away. In the last stage of freezing, vessels that clamped shut
> swing open, and the body floods with false heat. Doctors call it paradoxical
> undressing. Nearly all of them crawl somewhere to hide first.

Runner verdict: 49 words · no em dash · frame-zero complete thought fits one
6-word screen · hedges present · 11 verbatim caption cards. Runtime is an
ESTIMATE — ElevenLabs WPM must be measured and the script re-cut by whole ideas
if it misses.

## Claim map — qualifier level

Primary source: **Rothschild MA, Schneider V. "Terminal burrowing behaviour — a
phenomenon of lethal hypothermia." Int J Legal Med. 1995;107(5):250-6.**
69 lethal hypothermia deaths examined 1978-1994.
https://pubmed.ncbi.nlm.nih.gov/7632602/

| Script clause | Evidence | Guardrail |
|---|---|---|
| "**Some** freeze to death undressed" | VERIFIED — paradoxical undressing in **25%** of 69 cases | Keep **some**. Never imply all or most freezing deaths. |
| "Rescuers find garments scattered in the snow, a trail leading away" | VERIFIED for the disrobement finding; the snow setting is the outdoor hypothermia case | Do NOT assert footprint forensics the source doesn't describe. Scene is illustrative of outdoor cases, not a claim about the study's sample. |
| "vessels that clamped shut swing open" | VERIFIED — reflex vasoconstriction in the first stage, then paralysis of the vasomotor centre | Plain-language rendering of the source mechanism; do not name a temperature or timing. |
| "the body floods with false heat" | VERIFIED — "peripheral vasodilatation effecting a feeling of warmth" | **False** heat is deliberate: it is a *sensation*, not a real temperature rise. |
| "Doctors call it paradoxical undressing" | VERIFIED — the named phenomenon | The reveal beat. |
| "**Nearly all** of them crawl somewhere to hide first" | VERIFIED — "nearly all bodies with partial or complete disrobement were found in a position which indicated a final mechanism of protection" (terminal burrowing) | Keep **nearly all** — the source's own hedge. "Of them" = of those who undressed, NOT of all hypothermia deaths. |

**CORRECTION TO OUR OWN BRIEF:** `NEXT_EXPERIMENTS.md` states "20-50% of lethal
hypothermia cases are found partially or fully undressed." That range is **not
attributable to this source**, which reports **25%** in a 69-case series. (A
separate smaller series reports a much higher rate, so the true figure varies by
sample.) The script therefore uses the hedge "some" rather than any percentage.

## Outcome declaration

- **Retention moment:** the named reveal, "Doctors call it paradoxical
  undressing," landing at ~78% — the delayed payoff the open loop exists for.
- **Share moment:** the closing line. "Nearly all of them crawl somewhere to
  hide first" ends on **first**, which leaves the question open — the residual
  mystery, and the transferable fact.
- No save/comment/like bait is added. Comments may emerge from the residual
  mystery on their own; that is the only acceptable source.
- In-video Curio signature: decide after the master exists; OMIT if it damages
  the ending (CONVERSION_SYSTEM).

## Loop design (applies lessons already locked)

The close ends on "first," which is grammatically unresolved — it should be
delivered with a RISING terminal contour so the ending asks rather than lands.
Measured on MICROGRAVITY-FLAME: compound emotion tags are ignored by v3; a
**single clean tag** on the final line is what produced a rising close.

## Production gate

**HARD STOP: Leon approves the concept and exact script before narration.**
Then: audio story first → audio review → visual build → independent review →
captions (custom Pillow engine, NOT Captions.ai — it trims engineered silence
and renormalises audio) → `node tools/finalqa.mjs` → final review. Nothing posts
automatically.
