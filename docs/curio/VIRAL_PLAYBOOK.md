# Curio viral playbook

> **LIVING DOCUMENT — LAST UPDATED 2026-07-18.** Always learning and REPLACING:
> supersede stale rules in place, never leave two contradictory entries.
> Latest evidence folded in: posted Harrison Reel analytics (EXP-202607-18-01).


Rules live in three states. Promotion discipline (from CLAUDE.md): observation →
metric → comparison vs prior evidence → CONFIRMED / PROVISIONAL / REJECTED →
this file + the factory rules DB updated. Every rule cites its evidence.

## Design frame: one primary outcome (Leon, 2026-07-12)

Every video is designed for **low cognitive load and one primary behavioral
outcome** — retention, shares, saves, comments, or likes — plus at most one
secondary. Stacking tactics for every outcome at once makes a video feel
manipulative, dense, and confusing. Think in **viewer mechanisms**, not
"psychology effects": first-frame comprehension → curiosity → evidence →
payoff → natural response.

- Curio default: **retention primary, shares secondary**.
- saves primary only for genuinely useful reference content.
- comments must come from real ambiguity or participation, never "What do you
  think?" bait.
- likes alone are never proof of retention (Boat v1: 6.3% likes, 59% skip).
- Banned regardless of outcome: fake controversy, unsupported psychology
  claims, anxiety bait, gender stereotypes, manufactured disagreement,
  loss-aversion CTAs.
- Enforced structurally: package schema requires `primary_outcome` /
  `secondary_outcome` / `outcome_moment`; the judge returns a machine-enforced
  `outcome_verified` verdict — false blocks publication regardless of numeric
  scores, and vague mechanism claims ("this creates curiosity") fail it.
- Published analytics — not theory or judge scores — decide whether the
  mechanism worked.

## First-frame preflight (2026-07-16 — split by evidence tier; Dead Water EXP-202607-16-07 confirming Third Man)

Every video passes this BEFORE production. Curio's own posts are unanimous on the OPENING:
the only retention winner (Third Man) put the anomaly on frame zero; every loser (Boat
v1/retry, Can't Forget, Dead Water) opened on context / atmosphere / generic imagery and
lost ~half the audience in the first ~3s.

**CONFIRMED by repeated Curio results (do these):**
1. Frame zero SHOWS or STATES the contradiction — not location, date, or atmosphere.
2. The viewer understands what is impossible essentially immediately (~1.5s).
3. The opening premise is a complete, low-cognitive thought of ~4–8 words.
4. Preserve mystery by withholding the EXPLANATION or NAME — never the premise.
5. Evaluate Instagram and Facebook SEPARATELY at 24h / 72h / 7d — never a combined total
   (FB has supplied ~60–89% of plays on every post).

**PROVISIONAL — strong hypotheses, NOT yet confirmed by Curio's own repeated analytics:**
6. Visible evidence or a meaningful state change by ~2s.
7. A new clue / escalation / consequence roughly every 1.5–2.5s.
8. The payoff produces social currency — a concrete fact the viewer can repeat to someone
   else. (Dead Water's factual payoff coincided with 0 sends/saves/comments, but its weak
   opening also shrank the audience that reached the payoff, so the cause is unproven.)

**Discipline:** no single result globally promotes an aesthetic or caption style — one post
is a data point, not a rule (promotion needs Curio's own repeated analytics).

## CONFIRMED (multiple independent results, incl. Curio's own)

**From Curio's OWN posted results** (2026-07-12 four-post analysis — the
strongest evidence tier we have; ledger EXP-202606-30-01 … EXP-202607-06-06):
- Immediate anomaly + danger strongly outperformed abstract explanation
  (Third Man skip 38.6% vs 59.1–73.4% everywhere else).
- Mystery works when the opening SHOWS evidence before naming the phenomenon
  (footprints at t=0; name at ~70–80% of runtime; residual uncertainty kept).
- Aesthetic quality produces likes WITHOUT retention (Boat v1: like 6.3%,
  watch ratio 25.5%). Likes are never proof of retention.
- Slow phrase-by-phrase hooks lose viewers when the premise needs several
  fragments (Boat v1/retry: ~half the audience gone in the first seconds).
- Lengthening a weak format does not rescue it (retry 23.5s→28s: every metric worse).
- Generic brain imagery underperformed concrete survival imagery
  (Can't Forget skip 67.7% despite the best share/save rates).
- Combined IG+FB views are NOT a valid optimization target — FB supplied most
  views on 3/4 posts while the engagement rates are IG signals.
  Platform-separated analytics are mandatory (enforced in the capture template).
- **Second confirming data point — Dead Water (EXP-202607-16-07, captured
  2026-07-16):** a context-first opening ("IN THE ARCTIC" + a mostly-static
  beautiful ship) again lost ~45% of viewers by ~3s (skip 58.5%), then the curve
  stabilized after ~7-9s — the subject held the stayers, the opening lost the
  scrollers. IG 224 ≈ Third Man's 240 while FB supplied 89% of the 2,073 combined
  plays (NO IG breakout), and every high-intent action (share/save/comment/
  repost/follow) was 0. Reconfirms: immediate anomaly > context; combined totals
  mislead; plays/likes ≠ retention or social currency. (Source file unverified —
  closest local match REP-2-captions-export-v3-leveled.mp4.)

**Hooks**
- Reveal the entire mystery/tension in line one, ≤12 words. Never open with
  context, a logo beat, a fade-in, "did you know", or a question answerable
  with "no". _Evidence: launch-brief platform history (Third Man vs Dead
  Internet v1); every 2026-07-12 vidIQ outlier opens with instant premise._
- Immediate anomaly beats atmospheric setup. _Evidence: Dead Internet v1 failure
  (confusing opening, 58.9% skip-class behavior); Fata Morgana IG vs YT split._
- Concrete specificity reads as evidence: dates, names, amounts ("June 29,
  2026", "$34,000 in seconds", "75-year-old Vera Williams"). _Evidence:
  2026-07-12 vidIQ sweep — specificity present in 5/6 top IG/TikTok outliers._

**Retention**
- Viewer participation beats passive explanation (stare tests, "which one are
  you", brain tests). _Evidence: brief; vidIQ 2026-07-12: brain-test short
  10.8M views, 247× channel breakout._
- Escalation is mandatory: evidence → twist → payoff; a second curiosity turn
  ~60% mark; slow visuals allowed, slow information never.
- One topic per short. 12–16s default; exceed only when the story earns it.

**Engagement triggers**
- Self-identification drives comments ("this describes me"). _Evidence: brief;
  vidIQ: "4 Traits of a Genuinely Rare Man" 989K @ 3.3% ER on a 42K channel._
- Unresolved mysteries drive shares/rewatches; useful techniques drive saves.
- Loop endings (last line re-arms the first) drive completion + replay signals.

**Audio**
- An audio bed is not optional. Every high-performing dark/mystery outlier in
  the 2026-07-12 sweep used music or voice+music; zero used naked narration.
  Curio stack: low drone bed + subtle ticking + near-silence before the punch +
  one clean boom on the signature. Mute VO during staring/tension holds.

**Visual**
- Premium visuals cannot compensate for a weak participation/story engine.
- Text must be readable sound-off; 3–7 words per beat; emphasis via timing/
  scale/weight, never loud color. No logo or app pitch in the opening.

**CTA**
- Soft Curio signature in the final 1–2s only ("Real rabbit holes live in
  Curio."). No download screens; no "download now" until the App Store is live.

**Factuality**
- No invented stats, no "studies show" filler, no unsupported psychology claims
  presented as science (e.g. sleep-personality typologies are framing, not
  fact). Fake mysteries must never be presented as verified events.

## PROVISIONAL (evidence exists, not yet validated by Curio's own analytics)

**From the four-post analysis** (need more Curio posts before promotion):
- Survival mystery may be Curio's strongest initial archetype (n=1 winner).
- Named rare phenomena may outperform broad "what if" explanations.
- Human presence — even a distant silhouette — may improve retention over
  symbolic imagery.
- Remaining ambiguity after the reveal may improve comments and replays.
- Concepts with save/share pull can still fail on a generic first frame
  (Can't Forget: 1.6% shares+saves, 23.6% Explore, 67.7% skip).
- Target 15–20s (winner was 20.17s) — dataset too small for an exact optimum;
  the 12–16s default stands until more data.

- **Static read-a-card short (4-6s)** — full-screen title + numbered list,
  single frame, video shorter than read time → pause/screenshot/save mechanic.
  DEMOTED from approved-patterns.json 2026-07-12 (Codex review): promotion was
  premature — only one reference carried documented metrics, and Curio has
  never posted a card. Status: **FROZEN by Leon (2026-07-12) — no card
  generation spend** (enforced: API returns 403 while CARDS_FROZEN≠0) until an
  atmospheric-mystery baseline exists. The v2 card spec (4-5 named-mechanism
  items, loudness-gated bed, late footer) is built and ready if unfrozen.

- **Eerie-footage-plus-text is the winning no-avatar format**: static/slow
  cinematic footage with an unsettling quality (abandoned hallway, blood-red
  sky, ice shelf) + one static curiosity text + dark ambient music. Low effort,
  loop-friendly. _Evidence: vidIQ 2026-07-12 — CERN reel 1.6M (14.9×), red
  train yard 5.6M (167×), ice wall 182K (17.5×). Curio validation pending._
- **AI-narrated mystery footage is platform-accepted on TikTok** (TTS voiceover
  + guiding text + drone bed). _Evidence: @redacteddept 487K @ 16.4×._
- **Breaking-news framing for mystery stories** (authoritative VO + motion
  graphics) works but sits at the edge of Curio's premium tone — test a
  premium-ified variant before adopting. _Evidence: @breakingnewsusalive 342K
  @ 21.3×._
- Listicle "N dark psychology facts" shorts get steady volume but weak
  engagement (1.6–1.7% ER) — likely poor conversion for a premium brand; low
  priority. _Evidence: The Success Diary channel pattern, 3 videos this month._

**From the Codex external-benchmark sweep (vidIQ live, 2026-07-13 — REP-2 v6
spec). PROVISIONAL external evidence: none of these is promotable until
Curio's own publishing analytics confirm them:**
- **Continuous micro-payoffs while withholding the final name** — viral
  explainers don't merely delay one answer to ~75%; they deliver new evidence,
  action, or payoff every 1–3 seconds and withhold only the name/interpretation.
  _Evidence: Zack D. Films grave-bell (107.9M views, ~8 meaningful visual
  developments in a short runtime, youtube.com/shorts/w7PGmnhNUMY); Zack
  Tootsie-Rolls-in-war (121.7M, visual change every 2–3s, multiple payoffs,
  youtube.com/shorts/dOn3rgeW1Jg). Counted on our own masters: REP-2 v5 had 4
  machine-detected major changes / 18.2s; v6 rebuilt to 7 machine-detected +
  4 continuous-camera developments._
- **Action begins by ~2s; impossible-looking payoff by ~5s; the phenomenon
  itself creates replay.** _Evidence: ocean-physics experiment short, 59.6M
  views, 615× breakout (youtube.com/shorts/7UY7tBBdP8E)._
- **Universal fear / bizarre contradiction in the first sentence, premise
  visually complete within ~5s, literal visuals throughout.** _Evidence: both
  Zack D. Films shorts above._
- **Negative control:** the existing Dead Water explainer
  (youtube.com/shorts/zn4iYYai7uY) — cliché opening, generic stock,
  disconnected imagery, late explanation, no visual "aha".
- **Promotional exit signal risk:** an on-video brand line appearing while the
  final idea is still landing may read as "content over" and trigger a swipe —
  REP-2 v6 dropped the footer entirely on this theory. _Curio validation
  pending (REP-1/2/3 analytics)._

## REJECTED

**From the four-post analysis (2026-07-12):**
- Atmospheric sentence fragments before the premise (Boat v1: 59.1% skip).
- Repeating one composition through most of the hook (Boat retry: 73.4% skip).
- Generic AI brain imagery as the opening subject (Can't Forget: 67.7% skip).
- Treating likes as proof of retention (Boat v1 disproves it).
- Treating cross-platform total views as one metric.
- Changing hook, duration, visuals, pacing and CTA simultaneously in a "retry" —
  an uncontrolled experiment teaches nothing even when it fails clearly.
- Assuming a visually beautiful video is automatically understandable.
- Long final product cards (both Boat posts carried one; both retention losers).
- **Unnormalized or clipping audio** (Can't Forget: −9.6 LUFS, +0.6 dBTP true
  peak). Renders are now loudnorm'd to −16 LUFS/−1.5 dBTP and hard-fail outside
  integrated [−20, −12] LUFS or above −0.9 dBTP (assertLoudness).

**From the Dead Water post (2026-07-16, EXP-202607-16-07):**
- **Context-first openings** — leading with location / date / atmosphere ("IN THE
  ARCTIC") before the anomaly is on screen (skip 58.5%; ~45% gone by ~3s).
- **Beautiful-but-static imagery as the scroll-stop mechanism** — premium stills
  do not stop cold viewers; they only help the ones who already stayed (the curve
  stabilizes only after ~7-9s).
- **Reading a Facebook-heavy combined total as Instagram validation** — 2,073
  combined (FB 89%) hid an IG result of 224 (≈ Third Man's 240) with every
  high-intent action at 0.
- (Zero shares/saves/comments is an OBSERVED fact but NOT a confirmed cause —
  "payoff lacked social currency" stays PROVISIONAL (see the first-frame preflight);
  the weak opening also shrank the audience that reached the payoff.)

- **Out-of-range audio, silent OR whisper-quiet** (card v1 shipped silent −inf;
  card v2 passed a binary −55 dB gate at an inaudible −45.6 LUFS): binary
  silence checks are insufficient — the gate is a loudness RANGE, in code.
- **Unnamed mechanism paraphrases** (card v1): items that gesture at psychology
  without naming the effect sound profound but teach nothing — no trust, no
  save. Cards must NAME the mechanism or state a checkable finding.
- **Flat-gradient + bottom-strip captions + naked TTS** (factory local render
  v1, 2026-07-12): subtitle-strip staging over an empty frame with no audio
  design reads unfinished. Text must be the cinematography (big, centered,
  metronome beats) OR sit over an eerie footage layer; audio bed mandatory.
  _Evidence: internal review — unanimous "it sucks"; consistent with sweep._
- Atmospheric/statistic-heavy openings (Dead Internet v1). Corporate/stat pivots
  raise early cognitive load.
- Bright color caption highlights, emoji, bounce, meme fonts, subtitle boxes.
- Boost-button vanity engagement; scaling ad spend before conversion tracking.

## Platform-specific

- **Instagram/Reels:** punishes cognitive load; fastest hooks, simplest premise,
  strong send-to-someone trigger. Separate IG views from FB views in analytics.
- **YouTube Shorts:** tolerates more narrative and slightly longer runtimes;
  title/thumbnail curiosity gap matters.
- **TikTok:** participation + AI-narrated mystery accepted; fast beats.
- Judge retention relative to length; small samples are noisy; sends/saves >
  likes for distribution.

## Topic-specific
- Survival psychology (Third Man Factor) = best performer to date: survival
  stakes + invisible presence + dark atmosphere + audio interruption + loop.
- Internet-mystery (Dead Internet) works only with instant visual clarity.
- Maintain the category quota from CURIO_MASTER_CONTEXT — no psychology-only feeds.

## Narrative-CU technique — PROVISIONAL (added 2026-07-16, Terminal Lucidity; not promoted until analytics)
- **Behavioral evidence in CLOSE-UP, not states.** A beat = something a mute viewer can name
  (unfocused eyes→focus arriving; hand clasp; focus LEAVING via progressive head-droop;
  reaction shots). Darkening/zoom/repeated-pose are NOT beats. Prove recognition with a
  motivated POV (gaze→object→reaction), not an isolated insert.
- **Punch-in for shot variety.** Final is 270-wide, source 720-wide → 2.6× headroom → crop
  real footage for full-res close-ups (zero morph, identity locked). Two source clips read as
  two setups; interleave face-CU / hands / photo / reaction so new info lands most cuts.
- **Tension = EVENTS, not grade.** Event-driven bed: add one harmonic layer per returned-
  ability beat, strip them through the withdrawal, hard-collapse to real silence before the
  name. Avoid synthetic rising sine sweeps at the end (read as weird) — use warm consonant
  fades (harmonics of the drone).
- **Loop trap (3 layers):** semantic (last line re-arms the first, generated in ONE continuous
  TTS take), visual (freeze-frame endpoint == frame 0), audio (unresolved-but-musical tail).
- REJECTED: warm sentimental bedside (healthcare-ad); wide-room opening; static label captions;
  reversed human motion; rolling single-phrase captions (Prism-One) for low-cognitive edits.
- **Emotional CONTINUITY (v4 lesson, PROVISIONAL):** technical correctness != a felt moment.
  (a) Write the script as ONE escalating thought, not sentence-fact-cards — em-dashes + gerund
  flow ("recognizing…, remembering…, even old jokes") keep the rise unbroken; uniform ~0.13s
  sentence gaps read as a list. Pick the TTS take with the FEWEST boundary pauses (most
  connected) — pause variation is the only measurable proxy for "one thought". (b) Bed must be
  ONE continuous foundation from frame 0 with SMOOTHLY crossfaded swells + a recurring motif —
  per-event layer bumps "feel assembled". (c) Edit with MOTIVATED cuts (eyes move -> reaction
  -> gaze -> hands -> look-down -> memory), not a relevant-shot list; a mute viewer should feel
  one moment unfolding. Dissolves only for memory/disappearance.
- **A SOURCED, SPECIFIC anomaly beats a generic definition (v5 lesson, PROVISIONAL).** "Some
  people with dementia briefly return" explains a phenomenon; "a man asked for a cigarette and
  a beer, sang for 45 minutes, went to bed, and was dead by morning" is an unforgettable story
  (Third-Man architecture: specific person -> impossible event -> escalating evidence ->
  disturbing consequence -> named reveal -> unanswered mystery). Build from the strongest
  DOCUMENTED case, disclose its evidence class (caregiver-reported, not clinical), invent
  nothing (no names/dialogue/medical detail/time spans).

---

## Harrison Okene posted-Reel evidence (2026-07-18) — see EXP-202607-18-01

### THE THREE GATES (adopt as the standard judging frame)
A video is judged on three SEPARATE gates, never one blended "it did well":
1. **Scroll-stop** — skip rate / 3s hold.
2. **Retention** — avg watch, end retention.
3. **Advocacy** — sends/shares, saves, comments, follows.
Harrison PASSED 1 and 2 and FAILED 3 (all zero on the 2026-07-18 dashboards).
**2026-07-19 FB-NATIVE UPDATE (Business Suite, platform-labeled):** gates 1+2
are now CONFIRMED on Facebook — 35,799 views (99.3% recommendations, ~135× the
Page's typical-post P75), avg watch 15 s (76%), 100% retention through 3 s,
56% completion. Gate 3 is WEAK, not literally zero: FB 4 shares + 8 saves +
185 reactions (~0.03% of views), 0 comments, 0 follows; IG-native = 1 like and
nothing else (IG plateaued at 179 / reach 113). On Instagram zero sends still
coincided with no expansion; on Facebook the recommender distributed massively
WITHOUT sends — so sends are an IG-expansion signal, while FB distribution can
run on watch-quality alone. Audience note: FB found 88% male 45–64 US/UK; IG
sampled 18–34. Never explain one platform with the other's metrics.

### CONFIRMED (repeated across Curio results)
- Put the complete physical contradiction/anomaly on **frame zero**.
- Human danger + an impossible *visible action* is a strong scroll-stopper.
- Withhold the **explanation and the phenomenon's name** — never the premise.
- Context-first atmospheric openings underperform anomaly-first openings.
- Instagram and Facebook performance MUST always be recorded separately.

### PROVISIONAL (await more evidence)
- Real motion in the opening may outperform static atmosphere.
- The hand-return loop may have supported completion.
- Facebook may respond especially well to visceral true-survival stories.
- Obvious AI anatomy/physics errors may reduce trust and high-intent actions
  (FB-native retention was NOT measurably hurt — the suspicion now attaches to
  the advocacy gap specifically, not to watch behavior).
- The factual ending may have lacked the emotional/social currency needed for
  shares or saves.

### REJECTED (do not learn these)
- "Veo is validated because the post got 4,174 views."
- "Combined cross-platform plays prove Instagram virality."
- "More generated motion is automatically better."
- Promoting complex AI-generated hands/faces/human interaction into the default
  production strategy.

### The formula (restated)
Stop them with an impossible event → reward them with an escalating explanation →
**finish with a fact they feel compelled to send.** Procedural closure ("he spent
two more days decompressing") ends the facts but earns no advocacy. Prefer a
transferable sentence, e.g. "the rescue itself could have killed him."
