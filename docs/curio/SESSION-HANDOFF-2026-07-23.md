# Session handoff — 2026-07-23

Written before a context compact. Everything needed to resume is here or in the
files it points at. Read `CLAUDE.md` first, as always.

---

## WHERE WE ARE: REP-1 at the script-approval gate, script APPROVED, narration NOT yet generated

**Next action:** generate the two ElevenLabs takes for REP-1, then the audio
story. Nothing has been spent on REP-1 yet.

- Brief: `docs/curio/productions/REP-1-PARADOXICAL-UNDRESSING-brief.md` (committed)
- Narration tool: `data/productions/REP-1-UNDRESSING/tools/rep1_narrate.py`
  — **written and dry-run verified 2026-07-23.** It is under `data/*`, which is
  gitignored, so it lives ONLY on this disk; it is not in any commit.

Exact resume command (from the REPO ROOT — a leading `cd` breaks `.venv` paths):

```
set -a && source .env && set +a
.venv/bin/python data/productions/REP-1-UNDRESSING/tools/rep1_narrate.py
```

What it does: two takes, A and B, with **identical text and tags** — the only
variable is `stability` (A 0.35 = the proven K-pattern, B 0.0). Single `[curious]`
at the open and a single `[curious]` on the closing line, the exact pattern that
produced the +192 Hz rising close on MICROGRAVITY-FLAME. It refuses to write a
take whose ElevenLabs alignment is not word-exact against the locked script, and
it now measures the **terminal F0 contour on the final word "first."** inline, so
selection is one command instead of a separate probe.

Verified without spending (dry-run of the pure functions): 49 words · `[curious]`
tags strip cleanly out of alignment · sentence bounds correct · F0 tracker reads a
120→180 Hz sweep as +29.8 Hz RISING.

**Selection rule: word-exact AND rising terminal contour.** A falling close reads
as "ended" and kills the loop — if both takes fall, re-record; do not fix in post.

### The approved script (49 words, ~18.7s projected @160 WPM)

> Some freeze to death undressed. Rescuers find garments scattered in the snow,
> a trail leading away. In the last stage of freezing, vessels that clamped shut
> swing open, and the body floods with false heat. Doctors call it paradoxical
> undressing. Nearly all of them crawl somewhere to hide first.

Validated through our own production runner: 49 words, no em dash, frame-zero
complete thought fits one 6-word screen, hedges "some"/"nearly" pinned, 11
verbatim caption cards.

### Fact gate (already done)

Primary source: Rothschild MA, Schneider V, *Int J Legal Med* 1995;107(5):250-6.
69 lethal hypothermia deaths 1978-1994. Paradoxical undressing in **25%**;
"nearly all" of those also showed terminal burrowing.
https://pubmed.ncbi.nlm.nih.gov/7632602/

**We corrected our own brief:** `NEXT_EXPERIMENTS.md` claims "20-50% of cases".
That is NOT attributable to this source (25%). The script therefore uses the
hedge "some", never a percentage. Full qualifier-level claim map is in the brief.

---

## WHY REP-1 AND NOT A TREND TOPIC (the correction Leon made this session)

I drifted: I ran vidIQ sweeps, found a 773x optical-illusion outlier, and started
steering the build toward trick-illusion content. **Leon stopped it. He was
right.** That violated three things:

1. It abandoned the standing queue. `NEXT_EXPERIMENTS.md` says the highest-value
   open question is whether "atmospheric survival mystery with immediate visual
   evidence" is a real archetype or whether Third Man was a fluke — answered by
   REP-1/2/3, each keeping the mechanism and changing only the subject.
2. It was off-brand. `CURIO_MASTER_CONTEXT` bans the cheap-fact-app / gamified
   register. Curio is premium, dark editorial, for 2:14 a.m. one-more-question
   minds. Illusion tricks earn views that mean nothing for a reading app.
3. It inverted evidence discipline. External outliers are **candidate tier** and
   never outrank Curio's own posted results.

**Standing rule going forward: vidIQ informs, Curio's own analytics decide.**

Today's sweeps are kept as candidate-tier notes only:
`data/viral-intelligence/2026-07-23-aphantasia-outlier-sweep.json`,
`…-live-demo-format-sweep.json`. Do not promote them.

---

## THE ANALYSIS THAT MATTERS: what actually works for CURIO (our own 6 posts)

Full file: `data/viral-intelligence/2026-07-23-curio-own-results-analysis.json`

| Post | Category | Opening | Skip | Watch |
|---|---|---|---|---|
| Harrison Okene | survival-true-story | ANOMALY-FIRST | **36.5%** | **66.2%** |
| Third Man | survival-psychology | ANOMALY-FIRST | **38.6%** | **59.5%** |
| Dead Water | strange-science | context-first | 58.5% | 42.5% |
| Boat v1 | strange-science | slow premise | 59.1% | 25.5% |
| Can't Forget | psychology-memory | generic brain | 67.7% | 24.5% |
| Boat Retry | strange-science | same, longer | 73.4% | — |

**Finding 1 — archetype.** Survival + anomaly-first is the ONLY archetype that
has ever retained for Curio: 2 of 2 survival posts are the top two; 0 of 4
non-survival posts retained. *Caveat: confounded — both survival posts also had
the best openings. n=6. Do not promote "survival" alone as the cause.*

**Finding 2 — strange-science is 0 for 3.** This retroactively contextualises
MICROGRAVITY-FLAME (also strange-science) alongside its production problems.

**Finding 3 — ADVOCACY IS THE UNSOLVED PROBLEM (confirmed).** Curio can win
retention but has never generated advocacy. Best ever is Third Man at 2 shares /
2 saves / 2 comments. Harrison won retention decisively and still got **0/0/0**.
Retention is near solved; sharing is not. Per Rule 47 the lever is a
TRANSFERABLE payoff sentence. Judge REP-1 on the three gates SEPARATELY
(scroll-stop / retention / advocacy) — a retention win with zero shares is a
partial result, not a success.

---

## PRODUCTION LESSONS LOCKED THIS SESSION (already committed)

- **Captions.ai is unusable for timeline-locked edits.** Live evidence on
  MICROGRAVITY-FLAME: its export came back 16.400s/492f vs our 16.770s/503f and
  −14.3 LUFS vs −17.1. The 0.407s was cut MID-STREAM (leading audio aligned at
  0ms, tail breath intact) — auto-trim removed ~0.4s of the engineered collapse
  silence. A mid-stream cut cannot be repaired by re-mux and destroys a
  pixel-exact loop. Its captions were word-perfect, so this is a TIMELINE
  failure, not a grouping one — it holds however good their custom-word editor
  gets. **Use the custom Pillow engine:**
  `data/productions/MICROGRAVITY-FLAME/tools/micro_captions.py` (adaptive
  pre-roll sized to the real inter-card gap; reveal card cut so the answer word
  never precedes its spoken payoff; collapse emptiness asserted in code; audio
  stream COPIED, correlation 1.000000). Recorded on the locked profile.
- **ElevenLabs v3 emotion tags: SINGLE clean tags only.** Compound comma tags
  (`[wondering, lifting]`) are silently ignored — proven: takes G/H still fell
  −35 Hz. A single `[curious]` on the final line produced a **+192 Hz rising**
  close. v3 is already the newest model; it is the only one supporting tags.
- **A falling final word breaks the loop.** Measure F0 on the last word; a
  terminal fall reads as "ended". Rising = question tone = loop pull.
- **Collapse trims must be TARGETED, not geometric.** Cutting from the middle of
  a pause removed the silence and left a loud in-breath inside the engineered
  collapse. Keep the true silence after the reveal; excise the breath.
- **finalqa's silence check uses `silencedetect`** — it needs 0.35s
  CONTINUOUSLY below −35 dB, not an average. Slow gate ramps ate the window.
- **Seamless audio loop:** render the bed PAST the loop point and equal-power
  crossfade its tail onto its head; voice on top, un-crossfaded. Never fade both
  boundaries to zero (that leaves an ~8ms silence dip every loop).
- **Purge stale frames before rendering** (doctrine 21) — a leftover frame from a
  longer render corrupted a loop check.

---

## MACHINE / TOOLING STATE

- Apple M4 / 24GB. ffmpeg 8.1.2, whisper.cpp 1.9.1 (`large-v3-turbo-q5_0`).
- Python venv at `.venv` (numpy, Pillow). **Run scripts from the repo root.**
- Render full-res 1080x1920 directly; no low-res preview step (Leon).
- vidIQ is a **claude.ai connector**, not a Claude Code MCP — `/mcp` will not
  list it. It drops mid-session and needs a session restart to re-register.
  Balance was ~115 credits after 2 sweeps today (renewable 25, resets 2026-08-08).
- OpenAI key in `.env` is the one pasted in chat on 2026-07-22 — **still needs
  rotating**; it is also on the public Render service.

## DEPLOYED

`curio-video-automation.onrender.com` — live, $14.50/mo, Postgres. Mutations are
admin-token protected (verified 401); GETs are public but the DB is empty.
`autoDeployTrigger: commit`, so pushes to `main` redeploy.

---

## RESUME CHECKLIST

1. Read `CLAUDE.md`, then this file.
2. Verify `data/productions/REP-1-UNDRESSING/tools/rep1_narrate.py` is intact.
3. Generate takes A and B (2 max). ASR-verify word-exact; measure F0 on the final
   word and pick the RISING one.
4. Build the audio story; collapse 0.35-0.50s with ≥0.35s continuously
   below −35 dB; 0.30s loop breath; seamless-loop wrap.
5. Leon's ear on the audio story = the single pre-visual stop.
6. Visuals: real/licensed first. Survival + anomaly-first opening — clothing in
   snow at t=0, before any explanation.
7. Captions via the custom Pillow engine. `node tools/finalqa.mjs` on the master.
8. Nothing posts automatically.
