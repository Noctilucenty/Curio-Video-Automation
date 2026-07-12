# Video reference audit (2026-07-12)

The analysis gate that must precede any renderer work. Three evidence classes
are kept SEPARATE throughout:

- **[M] Measured** — machine-verified (ffprobe / ebur128 / scene detection);
  numbers in `analysis/reference-video-inventory.json`, corpus map in
  `data/video-reference-manifest.json`, contact sheets (24 frames/video) in
  `data/video-analysis/contact-sheets/` (local-only).
- **[O] Observed** — frame-level visual observations from the reviewer's
  watch-through (Codex, 2026-07-12).
- **[H] Hypothesis** — retention mechanics inferred from structure; NOT proven
  by the files, promoted only via Curio's own posted analytics.

## Executive conclusion

The failed Curio render does not fail because it is dark, slow, or minimalist.
It fails because it has **no active retention mechanism**. The corpus splits
into four distinct systems, and the failed render sits between them: too little
information for a pause-card, too little movement for narration, no experiment,
no human subject, no escalation, quietest audio in the set.

## Comparison matrix

| Video | System | [M] Duration | [M] Cuts@0.30 | [M] LUFS / TP | Primary mechanism [H] |
|---|---|---:|---:|---|---|
| 8 Hard Truths | static card | 5.04s | 0 | −14.1 / −3.4 | reading time > runtime → pause/replay |
| Psychology Facts | static card | 4.18s | 0 | −14.1 / −3.0 | dense claims → pause/verify |
| 6 Sides | static card | 5.06s | 0 | −16.8 / −4.5 | self-identification list |
| Five Traits | face-led narration | 59.07s | 0 | −9.2 / **+1.0 clip** | identity recognition, caption rhythm on a human face |
| Reverse Psychology | dialogue deduction | 74.33s | 1 (rev. est. 7) | −14.5 / −0.7 | payoff exposed up front → watch to verify |
| Ant Experiment | participation | 35.13s | 5 (rev. est. 9) | −10.2 / −0.2 | predict → visible test → outcome |
| Military Strategy | escalation montage | 86.29s | 49 (rev. est. 57) | −14.0 / −0.5 | unexplained action → stakes → delayed payoff |
| **Failed Curio render** | text over gradient | 21.47s | **0** | **−18.5** / −4.1 | **none sufficient** |

[M] Every reference has continuous audio ≥ −16.8 LUFS; the failed render is
the quietest item in the set. [M] The failed render has zero visual changes at
any threshold; every non-card reference has motion (face, hands, ants, cuts)
even when hard cuts are zero.

## Per-video observations [O] and Curio fit

1. **8 Hard Truths** — headline top third, eight complete points on frame one,
   orange serif hierarchy, deliberate empty lower area. Adaptable typography;
   generic motivational claims are a poor Curio fit.
2. **Psychology Facts** — red sans title, red phrase highlights, extreme
   density, questionable claims, loss-aversion CTA the whole runtime. The
   pause mechanic transfers; the styling and claim quality are REJECTED.
3. **6 Sides** — best scanning hierarchy of the cards (yellow numbering, dark
   texture) but sweeping gender essentialism and a permanent CTA. Hierarchy
   transfers; content pattern REJECTED.
4. **Five Traits** — one continuous B/W talking-head close-up; phrase captions
   update every 1–2s near center-lower; restrained pale-yellow emphasis;
   premise clear by ~2–3s. LESSON: one shot can work only when the shot
   carries human motion + voice + frequent text progression. A gradient
   supplies none of those.
5. **Reverse Psychology** — first frame states the whole setup ("smartest way
   to catch a guilty person"); dialogue mentions the body immediately; viewer
   watches to verify the slip. Deduction + replay-to-verify transfer;
   persistent follow overlay and reposted footage do not.
6. **Ant Experiment** — hands + two colored cups visible immediately; binary
   choice readable in ~1s; first behavioral result by ~8–10s; mid-video
   subscribe interruption is the anti-pattern. **Strongest transferable
   system**: prediction → visible test → result → explanation.
7. **Military Strategy** — action-first open (water poured on the ground),
   meaning delayed, ~1.5–1.7s average cut interval, every narration beat gets
   a new composition. Strongest editing/narrative reference; footage rights
   and cut density are not directly reproducible.

## Why the failed render fails [O over M]

Text written like kinetic typography, rendered like subtitles: semantically
important beats produce almost no perceptual change (same size, position,
weight, background, transition). First frame nearly empty; premise never
visually demonstrated; the reveal is just another caption; quietest audio in
the corpus with six silence regions.

## Derived requirements

**CONFIRMED by the corpus (multiple independent references):**
- Premise understandable from the first frame or first sentence.
- Audio bed from frame zero — zero references pair naked voice with an empty
  frame. (Now enforced in code: loudness gate window [−20, −12] LUFS.)
- The eye always has a task: read / watch a face / predict / detect / follow.
- Text needs a defined job (entire content ∨ processing aid ∨ framing device).
- Strong moments come from MEANING changes; one composition works only when
  another layer supplies change.
- The CTA is never the retention engine.

**PROVISIONAL (plausible, needs Curio's own analytics):**
- Cards replay because reading time exceeds runtime.
- Self-identification lifts comments/shares; prediction beats passive facts.
- Narrated pace target ≈ 1–2 meaningful visual changes per second (well below
  the movie recut's intensity).
- First-frame contradiction beats generic curiosity wording.

**REJECTED for Curio:**
- Unsupported psychology generalizations; gender/nationality bait.
- Persistent follow overlays; loss-aversion CTAs; CTA sequences that
  interrupt the payoff.
- Dense red/white listicle styling; repurposed podcast/movie footage without a
  rights strategy.
- Bottom subtitles over an empty background; decorative random motion.
- Assuming cards and narrated videos share one composition system.

## Relationship to Curio's own posted data

The corpus ranks *mechanisms*; the posted-video analysis
(`data/posted-experiments.json`, ledger) ranks *what Curio's audience actually
rewarded* — and its winner (Third Man Factor) matches the corpus's narrative
system: immediate evidence, human presence, escalation, delayed named reveal.
Where the two disagree, posted data wins. Static cards remain frozen until a
narrative baseline exists; the corpus alone was not sufficient evidence to
promote them (that premature promotion is reverted).

Renderer consequences: `docs/renderer-v2-spec.md` (requirements) and
`docs/renderer-v2-implementation-plan.md` (sequencing). Renderer work stays
BLOCKED behind the NEXT_EXPERIMENTS replications and Leon's licensed audio.
