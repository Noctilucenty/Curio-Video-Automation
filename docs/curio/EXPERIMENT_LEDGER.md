# Experiment ledger

One entry per posted video. This file is the human-readable trail; the factory's
`performance_metrics` store (via `POST /api/performance/ingest`) is the machine
copy — keep both. A lesson here stays an OBSERVATION until promoted per the
CLAUDE.md discipline.

## Entry schema

```yaml
id:                # EXP-YYYYMMDD-nn
date:              # posted date
platform:          # instagram | tiktok | shorts
topic:
length_seconds:
opening_frame:     # what is literally on screen at t=0
hook_wording:
visual_mechanic:   # e.g. eerie-footage+text, kinetic type, staring test
caption_style:
audio_style:
cta:
metrics:           # views, reach, skip_rate, avg_watch_time, completion_rate,
                   # rewatch_ratio, likes, comments, shares, saves,
                   # profile_visits, link_clicks, installs (null if unknown)
interpretation:
confidence:        # low | medium | high
rule_action:       # none | created PROVISIONAL | promoted CONFIRMED | rejected
```

---

## EXP-202607-01 — Third Man Factor (Instagram)

- date: 2026-07 (exact post date TBC by Leon)
- platform: instagram
- topic: Third Man Factor (survival psychology)
- length_seconds: 18
- opening_frame: dark cinematic survival visual
- hook_wording: "When you're seconds from death…"
- visual_mechanic: dark cinematic footage + captions
- caption_style: cream minimal
- audio_style: dark bed + interruption
- cta: soft signature
- metrics: views 564 · reach 164 · avg_watch_time 11s · skip_rate 0.371 ·
  likes 4 · comments 0 · shares 2 · saves 0 · profile_visits null · link_clicks null
- interpretation: retention winner (11s avg on 18s = strong hold for account
  size), weak share/identity trigger — nothing invites the viewer to send it or
  claim it.
- confidence: medium (n=1, tiny reach)
- rule_action: created PROVISIONAL — "maintain survival narrative + loop; add an
  explicit social/identity share reason before the signature."

## EXP-202607-02 — Jamais vu / MIRROR (factory local render v1, unpublished)

- date: 2026-07-12
- platform: none (killed in internal review)
- topic: jamais vu staring test
- length_seconds: 21.5
- opening_frame: near-black gradient + bottom caption strip
- visual_mechanic: flat gradient + subtitle-strip captions + naked TTS
- interpretation: rejected before posting — no footage layer, no audio design,
  no on-screen event for 21s. Composition failure, not script failure.
- confidence: high (unanimous internal verdict; consistent with 2026-07-12
  vidIQ sweep where every dark/mystery outlier carried an atmosphere layer +
  music bed)
- rule_action: REJECTED pattern recorded in playbook; renderer v2 requirements
  derived (text-as-cinematography or eerie footage layer + audio stack).

## EXP-202607-03 — Static card v1 "brain signs contracts" (internal review, unpublished)

- date: 2026-07-12
- platform: none (Leon review — killed before posting)
- topic: quiet psychological mechanisms (card format)
- length_seconds: 5.2
- opening_frame: full card (title + 7 items + permanent footer)
- visual_mechanic: static typographic card, grain only
- audio_style: **SILENT** — aac track existed with no signal (anullsrc fallback)
- interpretation: Leon's scores — hook 7, typography 7, mobile readability 5,
  info value 4, audio 0, retention 5, brand fit 7, publish-readiness 3.
  Root causes: silent bed; 7 items too dense / body type too small; emphasis
  over-applied; items paraphrased mechanisms without NAMING them (sounded
  profound, taught nothing); permanent footer read as ad; zero motion.
- confidence: high
- rule_action: card spec v2 enforced in code (4-5 named-mechanism items,
  emphasis 1-3 words, 47pt body, late-fading footer, push-in motion, synth/
  licensed bed, structural SILENCE GATE on every render). Strategy note:
  static cards = SECONDARY save-format; atmospheric mystery narrative remains
  Curio's PRIMARY format bet.
