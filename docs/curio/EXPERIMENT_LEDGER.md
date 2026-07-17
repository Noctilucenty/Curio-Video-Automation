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

> **Platform separation is mandatory** (2026-07-12): IG and FB views must be
> recorded separately. FB supplied MOST views on 3/4 posts while every
> engagement rate is an IG signal — a combined total is not an optimization
> target. Machine copy of all four posted experiments (full creative metadata +
> measurements): `data/posted-experiments.json`, imported into the factory
> store via `npx tsx tools/import_posted_experiments.ts`.

## EXP-202606-30-01 — Third Man Factor (Instagram + FB crosspost)

- date: ~2026-06-30 (views graph starts Jun 30)
- platform: instagram (crossposted to Facebook)
- topic: Third Man Factor (survival psychology)
- length_seconds: 20.17 (measured; earlier ledger said 18 — corrected 2026-07-12)
- opening_frame: FOOTPRINTS visible at t=0 — anomaly before explanation
- hook_wording: "When survivors are about to give up… someone appears right beside them"
- visual_mechanic: escalating evidence footage — footprints → mountains →
  sailors → polar → distant person → struggling survivor → named phenomenon
- caption_style: cream minimal
- audio_style: restrained dark bed, −17.1 LUFS (measured), LRA 3.1
- cta: soft signature
- metrics: views 606 total = **240 IG + 366 FB** (split captured 2026-07-12
  22:49 from Reel insights — FB supplied 60%, consistent with the other three
  posts) · reach 165 (shown on the combined summary card — surface ambiguous,
  kept as IG-reach unverified) · avg_watch_time 12s (59.5% of runtime) ·
  skip_rate 0.386 · retention at end ~20% (graph estimate) · follows 0 ·
  likes 16 · comments 2 · shares 2 · saves 2 · reposts 2 (raw counts from the
  reel header; platform-displayed like rate 8.0% has an undocumented
  denominator — 16/240 IG views = 6.7%) · view sources: Reels tab 75.8% /
  profile 12.3% / Explore 6.4% / Stories 2.5% / Feed 2.1%
- interpretation: the ONLY clear retention winner — skip rate 20.5–34.8pp better
  than every other post; only video with nonzero rates across all engagement
  types. Mechanism (five reinforcing elements): immediate visual evidence +
  immediate stakes + human-shaped mystery + escalating supporting imagery +
  satisfying-but-incomplete explanation (residual uncertainty → replay/comments).
  The IG split confirms Facebook majority-sourced views on ALL FOUR posts —
  combined totals overstate IG performance everywhere, permanently justifying
  the surface-separation gates. follows 0 despite the 12.3% profile source:
  the reel pulls people to the profile but the profile doesn't convert yet.
- confidence: medium-high (decisive within n=4, but reach is tiny)
- rule_action: archetype "atmospheric survival mystery with immediate visual
  evidence" = Curio's PRIMARY bet; 3 mechanism replications queued
  (docs/curio/NEXT_EXPERIMENTS.md) to promote it CONFIRMED.

## EXP-202607-06-04 — 300 Years Boat v1 (Instagram + FB crosspost)

- date: ~2026-07-06
- length_seconds: 23.53 · audio −16.7 LUFS, LRA 4.5
- opening_frame: dark storm-ship composition; premise not yet stated
- hook_wording: "For 300 years, sailors who saw this thought…" — a FRAGMENT;
  the actual idea (false-horizon illusion) arrives near ~8s
- metrics: IG 196 + FB 307 = 503 · avg_watch 6s (25.5%) · skip_rate 0.591 ·
  retention at end ~5% · like 6.3% (2nd best) · shares 0 · saves 0.6% · comments 0
- interpretation: taste worked (likes), comprehension speed failed — ~half the
  audience gone within the first couple of seconds. 23.5s for a 12–16s idea.
- confidence: medium
- rule_action: REJECTED — "atmospheric sentence fragments before the premise";
  controlled 14–16s hook A/B queued (NEXT_EXPERIMENTS.md).

## EXP-202607-06-05 — Can't Forget Anything (Instagram + FB crosspost)

- date: ~2026-07-06
- length_seconds: 20.43 · audio −9.6 LUFS, true peak +0.6 dBFS — **CLIPPING**
  (others sat at ~−17; this is the audio-normalization failure that motivated
  the renderer's loudness-range gate)
- opening_frame: glowing brain silhouette — generic stock/AI-health look; no
  person, conflict, evidence, or mystery
- hook_wording: "What if you could never forget anything?" — reads as a
  superpower; the painful contradiction lands too late
- metrics: IG 72 + FB 207 = 279 · avg_watch 5s (24.5%) · skip_rate 0.677 ·
  retention at end ~4% · like 3.2% · shares 1.6% · saves 1.6% · comments 0 ·
  Explore source 23.6%
- interpretation: the TOPIC has pull (best share+save rates, Explore sampled it
  beyond the following) but the generic opening lost the sampled audience.
  Rewrite and retest — do not discard the concept.
- confidence: medium
- rule_action: REJECTED "generic AI brain imagery as opening subject";
  controlled first-3s hook A/B queued (NEXT_EXPERIMENTS.md).

## EXP-202607-06-06 — 300 Years Boat Retry (Instagram + FB crosspost)

- date: ~2026-07-06
- length_seconds: 28.00 · audio −17.1 LUFS, LRA 2.8
- changes vs v1: more explicit opening + longer duration + longer hold on the
  same composition + gradual serif phrases + more setup — ALL AT ONCE
- metrics: IG 136 + FB 270 = 406 · avg_watch missing · skip_rate 0.734 ·
  retention at end ~3% · like 0.9% · shares/saves/comments/reposts 0
- interpretation: every signal deteriorated (skip 59.1%→73.4%, like 6.3%→0.9%).
  Making the premise more explicit did not help because the first-3s experience
  got slower and less visually progressive. Also NOT a controlled A/B — five
  variables changed simultaneously, so no single cause is attributable.
- confidence: high (that the retry failed); low (why, variable-wise)
- rule_action: REJECTED — "lengthening a weak format" and "changing hook,
  duration, visuals, pacing and CTA simultaneously in a retry".

## EXP-202607-16-07 — Dead Water / "In the Arctic" (Instagram + FB crosspost)

- date: ~2026-07-16 (inferred from the views-graph start; exact posting time unverified)
- platform: instagram (crossposted to Facebook)
- topic: "dead water" — a ship mysteriously slowed/held by sub-surface internal waves (strange-science)
- length_seconds: ~18 (screenshot); local closest-match REP-2 exports = 18.83s / 1080x1920@30
- source_file: **UNVERIFIED** — closest local visual match `REP-2-captions-export-v3-leveled.mp4`.
  v1/v2/v3 (+ -leveled) share the same underlying master, duration, and imagery, but their caption
  treatments are NOT visually identical; the exact posted export is undeterminable without upload
  evidence
- opening_frame: atmospheric Arctic ship + "IN THE ARCTIC" title — geographic/atmospheric CONTEXT,
  NOT the anomaly (the impossible premise is not on screen at t=0)
- hook_wording: "In the Arctic…" location framing; the "dead water" contradiction arrives late
- visual_mechanic: mostly-static beautiful ship composition; slow context-first setup
- audio_style: atmospheric bed — −17.1 LUFS / LRA 1.8 / peak −5.1 dBFS (measured on the LOCAL
  closest-match file ONLY; UNVERIFIED as the posted file)
- metrics: **IG 224 + FB 1849 = 2073 combined** (FB 89.2% — combined total is NOT a win) ·
  accounts reached 162 (scope ambiguous — do NOT use as a per-account denominator) · avg_watch 8s
  (~42.5% of 18.83s; range 42.5–44.4% since IG shows only a rounded 0:18) · skip_rate 0.585
  (directly shown on the screenshot) · retention ~55%@~3s → ~40%@5-7s → ~30%@9-10s → ~23-25%@end
  (graph estimates) · likes 9 (0.6% displayed) · comments/shares/saves/reposts 0 · follows 0 ·
  view sources: Reels tab 87.2% / Explore 9.6% / Stories 1.4% / Profile 0.5% / Feed 0.5%
- interpretation: NOT a creative win despite 2,073 combined plays. IG 224 ≈ Third Man's 240 → no IG
  reach breakout; every high-intent action (share/save/comment/repost/follow) = 0. The retention
  curve pins the failure to the OPENING: ~45% gone by ~3s, then it stabilizes (~7-9s onward) → the
  subject wasn't the problem, the context-first scroll-stop was. Mostly COLD traffic (87.2% Reels +
  9.6% Explore) makes this a genuine new-viewer verdict, not a follower artifact. Improved viewing
  DEPTH over the older boat posts (skip 58.5% vs 59.1/73.4%) but did NOT solve their shared opening
  problem. Every high-intent action was zero. PROVISIONAL interpretation: the payoff may not have
  created enough repeatable/social value, but the weak opening also reduced the audience that
  reached it. vs Third Man (240 IG / 38.6% skip / ~59.5% watch / real shares+saves+comments).
- confidence: medium (n small; source file unverified; retention values are graph estimates)
- rule_action: REJECTED (causal, repeated evidence) — context-first opening (location/date/
  atmosphere before the anomaly); static beauty as the scroll-stop mechanism; combined IG+FB total
  as an IG creative signal. OBSERVED — every high-intent action was 0. PROVISIONAL (not causally
  proven; the opening failure also shrank the audience reaching the payoff) — the payoff may lack
  repeatable/social value; atmospheric stills may aid retention AFTER the premise lands (the later
  curve is stable). NOT REJECTED — the Dead Water topic (failed at scroll-stop + outcome conversion,
  not subject interest). Promoted the first-frame contradiction-hook preflight to the playbook
  (CONFIRMED vs PROVISIONAL items split there).

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
