# Renderer v2 — specification

Derived from `docs/curio/VIDEO_REFERENCE_AUDIT.md` (corpus mechanics) and
`data/posted-experiments.json` (Curio's own posted results). Requirements cite
their evidence class: [M] measured, [O] observed, [H] hypothesis, [P] posted-
data. This is a SPEC, not a build order — see the implementation plan.

## Render modes (three, explicitly distinct)

Cards and narrated videos must never share a composition system [O: every
corpus system differs structurally].

1. **`card`** — static read-card (exists; FROZEN for production until a
   narrative baseline exists). Keeps: full premise on frame one, loudness-gated
   bed, late footer, 4–5 items, push-in. Adds when unfrozen: overflow proof
   (render must FAIL if text can't fit at minimum size, never truncate),
   reading-density check (words ÷ runtime vs a ~4 w/s ceiling).
2. **`narrated`** — atmospheric mystery montage (the primary bet [P]).
   Replaces the v1 subtitle-strip renderer.
3. **`participation`** — visual experiment/prediction formats (MIRROR, stare
   tests) [O: strongest transferable system]. Deferred until `narrated` ships.

## The narrated mode contract

**Input: a visual-event timeline, not caption timing.** The generation step
must emit, per beat: `{ role, text, tStart, tEnd, visual: { subject, change },
audio: { layer } }` — the renderer refuses a package whose beats lack visual
changes [O: the v1 failure was captions changing while the frame didn't].

**Semantic text roles** (each with distinct scale/placement/weight/motion):
- `hook` — largest, near-center, on screen at t=0 with the anomaly [P].
- `evidence` — mid-scale, positioned WITH the thing it describes.
- `escalation` — scale/weight step-ups; may interrupt rhythm.
- `reveal` — the named phenomenon; biggest emphasis moment, at ~70–80% [P,
  provisional].
- `residual` — the unresolved line; calm, smaller, holds to loop point [P].
- `signature` — soft Curio line, final 1–2s only, dimmed [P: permanent
  branding read as ad].

**First-frame law:** the render spec must name the frame-one subject
(anomaly image + hook text), and the renderer asserts it is non-empty — a
gradient is not a subject [O+P].

**Perceptual-change gate [M-checkable]:** rendered output must show a
meaningful visual change at least every ~2.5s (measured via frame differencing
at a calibrated threshold, not just hard cuts — push-ins, layer reveals and
text-scale events count). The v1 render (0 changes / 21.5s) must fail this
gate by a wide margin.

**Visual layers:** obsidian base → atmosphere layer (licensed/generated eerie
footage OR text-as-cinematography with kinetic scale) → text roles → grain.
No naked gradient under narration, ever [P: REJECTED pattern].

**Audio layers:** bed (registry-approved only) → narration → accents
(`tick`, pre-reveal near-silence, one `boom` on the signature) [O: audio bed
universal in the corpus; P: silence gate history]. Final mix loudnorm to
−16 LUFS / −1.5 dBTP; gate window [−20, −12] LUFS, TP ≤ −0.9 (exists, in code).

**Length:** 12–16s default, 20s ceiling for an earned story [P: winner 20.17s;
provisional].

## Quality gates (all deterministic, all pre-queue)

| Gate | Status |
|---|---|
| Loudness window + true peak | ✅ shipped (`assertLoudness`) |
| Fact-check before render | ✅ shipped (`factcheck.ts`) |
| First-frame subject non-empty | v2 |
| Perceptual change ≥ 1 per 2.5s | v2 |
| Text minimum relative size + safe-area collision | v2 |
| Card overflow/density proof | v2 (mode frozen) |
| CTA duration budget (≤2s visible) | v2 |
| Per-render metadata record (assets, seed, versions, timeline) | v2 |

## Non-goals

- No avatar, ever (Leon).
- No 50-cut movie-recut intensity — 1–2 meaningful changes/second maximum [H].
- No universal "viral renderer": archetype selection happens in generation;
  the renderer just executes a timeline faithfully and enforces gates.
