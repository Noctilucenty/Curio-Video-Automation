# Brainstorm re-understanding — 2026-07-23 (full corpus re-read)

Written after reading EVERY tracked doc end-to-end (doctrine, playbook, pending
lessons, growth OS, conversion system, ledger, master context, infra roadmap,
references, capture template) against everything learned today (two FB
breakouts decoded, four-gate adoption, REP-1 produced end-to-end, Captions.ai
new-UI recipe). This is the synthesis: what the corpus now actually says, where
it contradicts itself, and what to do about it.

---

## 1. THE UNIFIED MODEL (what all the evidence says together)

**Curio operates two distribution machines with opposite properties, and the
docs mostly still describe them as one.**

| | Facebook Reels | Instagram Reels |
|---|---|---|
| Distribution | MASSIVE, delayed (surge 27–44h), watch-quality-driven, no sends needed | Near-zero; distributed exactly ONE post ever (BRINE) |
| Audience | Men 85%, 45–75+, US/UK/CA — NOT the app persona | 18–34 — IS the persona |
| Conversion | 0 follows, 0 link clicks on 152K views | The only 3 follows Curio has ever earned |
| What wins there | Immediate visible anomaly (survival OR nature) | Persona-fit named-phenomenon curiosity science (n=1) |

Everything else we've confirmed hangs off this: anomaly-first openings
(CONFIRMED, repeated), context-first rejected (repeated), four judging gates
(scroll-stop / retention / advocacy / conversion), advocacy weak everywhere
(~0.006% shares at scale; bait does nothing), retention essentially solved,
conversion solved NOWHERE (the founder engine exists to attack this).

**REP-1 is the perfectly placed experiment:** survival stakes (FB lane) + named
phenomenon + persona-fit curiosity (IG lane). Tomorrow's post is a two-lane
test in one artifact.

**The archetype question has sharpened.** NEXT_EXPERIMENTS still frames it as
"is survival-mystery the archetype?" — but Ant Mill (nature, non-survival,
anomaly-first) broke out identically to Harrison on FB. The live matrix is now
{anomaly-first vs context-first} × {survival vs not} × {surface}: anomaly-first
wins FB regardless of subject (2 breakouts); context-first loses everywhere
(4 failures); the IG lane may care about CATEGORY (persona fit) more than
archetype. REP-1/2/3 should be read against THIS matrix, not the old binary.

## 2. CONTRADICTIONS FOUND (living-doc discipline: resolve, never leave two standing)

**C-1. GROWTH_OS §7 still says THREE gates.** We adopted FOUR (conversion)
today in the capture template + engine code. → Sync GROWTH_OS.

**C-2. FB caption link: CONVERSION_SYSTEM/P-37 vs today's D1 rule.** P-37
(Codex): FB Reel-description URLs "not promised clickable — use Page CTA".
Today's adopted D1: put a tappable trycurio.app line in every FB caption.
BOTH now stand — that's a P-41 violation. RESOLUTION: D1 stands **as a
measured test** (the new conversion gate judges it: if FB link clicks stay ~0
after 3 linked posts with real distribution, P-37 wins and D1 reverts).
Recorded here so the contradiction is explicit and time-boxed.

**C-3. Infra roadmap frozen by a gate that already passed.** "No wiring before
the REP-3 Codex review verdict" — REP-3 v2.1 shipped its review 2026-07-1x
(doctrine 27 records the ruling). The freeze is over; nobody unfroze the doc.
Roadmap #2 (Meta insights automation) was in fact built tonight
(tools/capture_meta_insights.ts, pending token). Roadmap #1 (YouTube APIs,
"HIGHEST PRIORITY") has credentials sitting in .env wired to NOTHING.

**C-4. Master context "keep current" is not current.** App status still reads
"v1.0 submitted 2026-07-08" — 15 days ago. If the app has since been APPROVED,
every CTA constraint in the corpus ("never download now until live") flips,
and the conversion layer gets a real App Store destination. **Leon: what is
the review status?** This is the single highest-leverage stale fact.

**C-5. CONTENT_ENGINE_STATE is a 2026-07-12 snapshot** describing a pre-real-
analytics world (25 mock-era videos, 9 rules). Reality: 9 posted experiments
with platform-native data, 22 active rules, 4 learning runs, four-gate
scoring, 2 breakouts. → Rewrite.

## 3. PROMOTION DEBT (lessons whose gates passed but never moved)

- **P-14 iCloud eviction (marked PROMOTE IMMEDIATELY, never promoted).**
  data/productions sits under Desktop (iCloud-synced); BRINE's mid-render
  corruption WILL recur. Promote to doctrine: renders copy inputs to a
  non-iCloud scratch dir; verify st_blocks>0 before reading; artefact mtime
  check before QA. (REP-1 built clean tonight by luck, not protection.)
- **P-4 eleven_v3 speed no-op** — measured API fact, still only in pending.
- **P-43 engine change owed:** finalqa must FAIL LOUD when
  `total − last_word_end` is outside the loop-breath band. Still not in
  finalqa (verified tonight: no such check).
- **P-44 engine change owed:** motion-aware loop-seam check (seam-delta vs
  in-shot motion delta) instead of raw SSIM for live-footage masters. Still
  not in finalqa.
- **P-35 hard rule** (fixed-crop ink heuristics may NEVER assert caption
  presence) lives only in PENDING_LESSONS — and tonight's Captions.ai
  verification partially violated it again (ink probes asserted "collapse
  clean" without frame-reads; the frame-reads happened only where the numbers
  looked wrong). **Better instrument now exists: differential caption
  detection — diff the captioned export against the CLEAN master in the
  caption band; caption pixels = |captioned − clean| > threshold. Plate-
  independent, no luminance guessing.** Build it, promote the rule.

## 4. THE IMPROVEMENT BACKLOG (ranked by leverage)

**Strategy / decisions (Leon):**
1. **App Store status?** (C-4) — unlocks or keeps constraining every CTA.
2. **TikTok lane: start it.** Persona-fit discovery engine, completely
   untested, zero production cost (clean masters exist: Harrison, Ant, BRINE,
   Dead Water + REP-1). GROWTH_OS already specifies packaging; P-38 AI labels
   apply. The most promising unexplored surface given IG won't distribute and
   FB's demo can't convert.
3. **Two finished masters were never posted: REP-3 "Bloop" and
   MICROGRAVITY-FLAME.** Decide: post, hold, or retire. Sitting inventory.
4. **Profile funnel audit** (GROWTH_OS §8): is the IG/FB profile actually
   carrying the spec (bio line, pinned winners, link)? Third Man showed 12.3%
   profile-visit traffic converting to 0 follows — the profile IS the landing
   page and nobody has audited it against spec.
5. Render deployment: give it a job (durable store) or suspend it.
6. Founder-engine coordination: one posting calendar across both engines once
   account fork (F4) is decided; GROWTH_OS assumed a single engine.

**Engine (buildable without decisions):**
7. finalqa: loop-breath check (P-43) + motion-aware seam (P-44) + optional
   words.json input.
8. tools/caption_verify.py — differential caption detection vs clean master
   (kills the P-35 error class forever).
9. Promote P-14/P-4 into doctrine; add iCloud-scratch protection to render
   tooling.
10. Promote the per-production engines out of gitignored data/ into tools/
    (narrate gate w/ F0, audio-story QA, splice, Pillow captions, plate gen)
    — the doctrine's enforcement scripts must survive the disk.
11. GROWTH_OS/playbook sync: four gates everywhere; add the FB-dynamics
    section (surge timing, 3-sec-view proxy, demo reality) as CONFIRMED; add
    the two-lane model (§1 above) as the strategic frame.
12. Consolidate the scattered Captions.ai knowledge (rules 52/55, P-16–P-29,
    P-34, tonight's recipe) into one CAPTIONS.md procedure doc.
13. REP-1 posting package, done properly per P-36/P-37: four platform blocks,
    per-platform UTM links, AI-disclosure flags, checkpoint calendar.

**Already known, still open (from tonight's ops audit):** backup for 4.1GB
data/ (iCloud sync is NOT a backup — eviction + delete propagation), OpenAI
key rotation, META token renewal, REP-1 judge backfill before posting.

## 5. WHAT THE CORPUS GETS RIGHT (keep doing)

The evidence-tier discipline caught and reversed at least five wrong beliefs
this month (Harrison "advocacy zero", the P-26 caption misattribution, the
conditioned-retention misread, "Captions.ai unusable", the words-per-line
blame). The supersession machinery WORKS — the failure mode is only when a
lesson stays in PENDING without its gate being re-checked (§3). A standing
"promotion sweep" at the end of each production cycle would close that hole:
re-read PENDING_LESSONS, check each named gate, promote or re-date.
