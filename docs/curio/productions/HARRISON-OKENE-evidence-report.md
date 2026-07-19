# Harrison Okene posted Reel — evidence report (2026-07-19)

Status: post is **LIVE and actively growing on Facebook. FROZEN — do not edit,
delete, rebuild, repost, boost, or otherwise disturb it.**
Machine record: `data/posted-experiments.json` → `posted-harrison-okene`
(checkpoints preserved as time-series). Ledger: EXP-202607-18-01.

**Headline (blunt):** this is a **Facebook distribution winner, but not yet an
engagement or conversion winner.**

---

## 1. OBSERVED FACTS (nothing below this block is interpretation)

### Time-series checkpoints (platform-separated, mandatory)
| Captured | FB views | IG views | Combined | Reactions | Shares/Saves/Comments/Reposts/Follows |
|---|---|---|---|---|---|
| 2026-07-18 | 3,998 | 176 | 4,174 | 20 likes (IG header) | all 0 |
| 2026-07-19 | 26,165 | 178 | 26,343 | 153 (scope AMBIGUOUS) | all 0 |

- Facebook grew **~6.5×** between checkpoints; it now supplies **99.3%** of all
  plays. Instagram added **+2 views** — the IG non-follower test plateaued
  almost immediately.
- Combined totals are recorded but are NOT an optimization target.
- The 153 "reactions" figure is not platform-labeled; given the view split it is
  almost certainly FB-dominant. It was NOT written to the IG learning stream.

### Instagram-scoped insights surface (2026-07-18 screenshots)
Skip rate 36.5% (best Curio yet, vs Third Man 38.6%) · avg watch 13 s of a
19.633 s runtime (~66%) · retention est. ~75% @2s → ~33% at end · sources:
Reels tab 85.5% + Explore 8.1% (cold discovery) · 113 "accounts reached"
(scope ambiguous; clearly NOT Facebook-inclusive — 26k views over 113 accounts
is arithmetically absurd).
**These values live on an Instagram-oriented surface (several graphs explicitly
labeled Instagram-only) and MUST NOT be used to explain Facebook distribution.**

### Facebook measurement caveats (both are platform-documented)
- Facebook counts a Reel **"view" at 1 ms of playback** — the 26,165 headline is
  a distribution signal, not proof of meaningful watches.
- **We hold ZERO Facebook-native quality metrics.** META_ACCESS_TOKEN expired
  2026-07-14 14:00 PDT (Graph API re-tested 2026-07-19 → OAuthException
  190/463). BLOCKED until Leon renews with `pages_show_list`,
  `pages_read_engagement`, `read_insights`, Curio Page selected. Required on
  renewal: unique reach, 3-second views, avg watch + retention, completion,
  recommendation-vs-follower traffic, FB-native shares/comments, Page follows,
  then 24h/72h/7d snapshots.

### Upload identity (verification run 2026-07-19)
- Posted frame zero = the **glitchy (Veo) hand** (Leon-confirmed) → **v3
  lineage** (local closest match `preview-okene-v3.mp4`, 270×480@30, 19.633 s).
- Every local captioned export is v5-based and **ruled out** by frame-zero
  comparison (repo v5 family + `~/Downloads/a_hand_inside_the_wreck…_1717.mp4`,
  1080×1920@30 — v5 imagery, SSIM 0.97 vs v5 / 0.87 vs v3).
- No captioned v3 export exists on this machine → **posted-export identity
  remains UNVERIFIED** (resolution, caption text, audio loudness all unknown).

---

## 2. THE THREE GATES (Facebook framing)

| Gate | Verdict | Evidence class |
|---|---|---|
| **FB scroll-stop** | **PASS (provisional)** | Sustained, accelerating recommendation expansion (3,998 → 26,165 in ~1 day) is the only FB-native fact we hold; a recommender does not keep widening tests on content that dies at first contact. Direct proof requires FB 3-second views — not yet captured. |
| **FB retention** | **UNKNOWN** | No FB-native watch-time/retention/completion exists in our records. The IG-scoped 13 s / ~66% figures are cross-platform hints only and are explicitly NOT evidence for Facebook. |
| **Advocacy** | **FAIL (observed)** | At 26k+ combined plays, displayed shares, saves, reposts, comments, and follows are ALL ZERO at both checkpoints. 153 reactions is passive approval, not advocacy. |

---

## 3. HYPOTHESES (interpretation — none of this is proven)

1. **The frame-zero contradiction drives the stop.** A hand emerging from a dark
   wreck grabbing the diver is physically immediate, human, and comprehensible
   with no context — exactly what Dead Water's context-first opening lacked.
2. **Escalating single-story stakes support depth.** "Alive underwater" → "60
   hours" → "100 feet down" → "surfacing could kill him": every fact deepens one
   story rather than changing subjects.
3. **Facebook tailwind.** Meta is currently boosting recent original video and
   fast-learning recommendations — plausible amplifier, not measurable by us.
4. **The AI hand defects did not destroy the hook** at feed speed (the anomaly
   may even read stronger) — but they plausibly suppress trust and high-intent
   actions. This does NOT validate the artifacts; it means the premise survived
   them.
5. **The procedural ending caused the advocacy failure.** "Two more days
   decompressing" closes the facts but hands the viewer nothing transferable to
   send. This is the leading candidate cause for gate-3 failure, but visual
   quality, audience matching, and a possible low-res (270×480-source) upload
   remain plausible contributors — especially for the IG plateau.

## 4. Learning-system state
Import: `met_posted_harrison_okene_09ac5076` (IG-only stream, views 178;
ambiguous-scope figures refused). Learning run `learn_mrs3zzdx_012u7gms`
(gpt-5.6, 9 new rules, 31 total; improvementDelta null — no judge-vs-actual
pairs yet). New rules include: anomaly stated in 0–2 s as a complete clause;
18–21 s test window (28 s target dropped pending retest); transferable-fact
ending required; 7-of-10 slots to documented survival; no judge recalibration
until ≥10 matched prediction/outcome pairs.

## 5. What must happen next
1. Leon renews the Meta token → capture the FB-native list above (read-only
   first; verify Curio Page + the Harrison Reel are visible).
2. Keep 24 h-cadence platform-separated checkpoints while growth continues.
3. Next production follows the controlled replication brief
   (`REP-4-second-trap-brief.md`) — clean imagery, same hook architecture,
   advocacy-designed payoff. **Nothing posts without Leon's approval.**
