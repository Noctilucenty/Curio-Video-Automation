# Renderer v2 — implementation plan

Sequencing for `docs/renderer-v2-spec.md`. **Renderer work is currently
BLOCKED, deliberately**: the highest-value work is validating the archetype
with the NEXT_EXPERIMENTS replications (producible today in Captions.ai, the
path that made the Third Man winner) and closing the analytics loop on them.
Building v2 before knowing whether the archetype replicates would repeat the
card mistake — engineering ahead of evidence.

## Preconditions (gate to start Phase 1)

1. At least the three replication posts measured (IG-separated) — archetype
   confirmed or killed.
2. Licensed audio from Leon: dark bed / tick / boom, registered + approved in
   `assets/audio-assets.json`. (Synthwave.mp3 stays unapproved until licensed.)
3. Font decision for kinetic scale hierarchy.

## Phase 1 — timeline schema + generation

- Add the visual-event timeline to the package schema (`role`, `visual.subject`,
  `visual.change`, `audio.layer` per beat); generator prompt emits it;
  validator rejects beats without visual changes.
- Record per-render creative metadata (assets, seed, prompt/model versions,
  timeline) on the video row — the ANALYTICS_CAPTURE_TEMPLATE's "creative
  metadata" block becomes automatic.

## Phase 2 — narrated compositor

- Layer stack per spec (base → atmosphere → text roles → grain; audio bed →
  narration → accents). Text roles get distinct scale/weight/placement/motion
  (Swift caption tool already rasterizes; extend spec.json with role presets).
- First-frame subject assertion + CTA duration budget.

## Phase 3 — gates + regression harness

- Perceptual-change gate (frame differencing, threshold calibrated so the v1
  render fails hard and the Third Man file passes).
- Text minimum-size + safe-area collision checks.
- Regression fixtures: render one narrated fixture per merge; assert loudness,
  perceptual change, first-frame subject, duration.

## Phase 4 — A/B against the external path

- Re-render one replication script with v2 using identical narration and
  duration as its Captions.ai twin; post both under the controlled-cohort
  rules (pinned model snapshot, one variable). v2 must match or beat the
  external tool before it becomes the production path.

## Explicitly deferred

- `participation` mode (after narrated ships).
- Card unfreeze work (overflow proof, density check) — only if Leon unfreezes.
- Any HeyGen/avatar path. Any second backtest engine (learning run IS it).
