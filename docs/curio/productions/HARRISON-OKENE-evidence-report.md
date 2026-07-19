# Harrison Okene posted Reel — evidence report (2026-07-19, rev 2: FB-native captured)

Status: post is **LIVE and actively growing on Facebook. FROZEN — do not edit,
delete, rebuild, repost, boost, or otherwise disturb it.**
Machine record: `data/posted-experiments.json` → `posted-harrison-okene`
(3 checkpoints preserved as time-series + full `facebookNative` /
`instagramNative` blocks). Ledger: EXP-202607-18-01.
Rev 2 supersedes the morning report: **Facebook-native insights were captured
2026-07-19 ~11:30 PDT from Meta Business Suite's platform-labeled tabs**
(Leon's logged-in Chrome session, user-directed; the Graph API token is still
expired — renewal remains open for automated snapshots).

**Headline (blunt, updated):** this is a **Facebook distribution AND retention
winner. Advocacy is no longer literally zero, but it is still the weak gate.**

---

## 1. OBSERVED FACTS

### Post identity (now confirmed on-platform)
Published **Fri Jul 17, 7:54pm**, created on Instagram and crossposted to
Facebook ("Published by Instagram"), Page "TryCurio", FB content_id
122119453365356339, displayed runtime 0:20. Posted caption text captured
verbatim in the machine record (`postedCaptionText`). The exact uploaded FILE
is still not on this machine (identity of the captioned export remains
UNVERIFIED; imagery = v3 lineage per the glitchy-hand frame zero).

### Time-series checkpoints (platform-separated)
| Captured | FB views | IG views | FB shares/saves | IG actions |
|---|---|---|---|---|
| Jul 18 | 3,998 | 176 | (not visible) | 0 |
| Jul 19 ~10:00 | 26,165 | 178 | (dashboard showed 0) | 0 |
| Jul 19 ~11:30 (native) | **35,799** | **179** | **4 / 8** | 1 like |

FB added ~9,600 views in ~90 minutes between the last two checkpoints — still
accelerating. The Business Suite chart shows a slow ~24h build (~5k) then a
sharp acceleration from Jul 18 evening.

### FACEBOOK-native (platform-labeled, 2026-07-19 11:30)
- Views **35,799** · Viewers **17,645** (~2.03 views/viewer → replays exist)
- **Average watch time 15 s = 76% of runtime** · total watch time 3d 4h
- **Retention (unconditioned platform series): 100% through 3 s → 88% @4s →
  68% @9s → 67% @10s → 56% completion at 20 s.** Largest single drop 3→4 s
  (−11.6 pp). Only a tiny kink at the 10 s engineered-silence beat. Among
  15s+ viewers, retention stays ≥92%.
- Interactions 197: reactions 185 (👍162 ❤️1 😮2 😢1) · comments 0 ·
  **shares 4 · saves 8** · follows 0.
- **Watch-time distribution: Recommendations 99.3% / Followers 0.7% /
  Shares 0% / Paid 0%** — non-follower, recommendation-driven, confirmed.
- Audience (based on 3-second views): **88% men**, heavily 45–64. Geography:
  US 9.1K, UK 1K, CA 924, PH 649, AU 491.
- Page benchmark: typical post views P25=12 / P75≈266 → **~135× the P75**.

### INSTAGRAM-native (platform-labeled, same capture)
Views **179** · reach **113** (scope now CONFIRMED IG-only) · interactions
**1** (a single like — the earlier "20 likes" header reading was not IG-only)
· shares/saves/comments/follows **0** · avg watch 13 s · total watch 27m 52s ·
plateaued at ~169 within ~4 h. Audience 71% men, 18–34 heavy — a **different
demographic** than Facebook's 45+ men.

### Standing caveats
- FB counts a view at 1 ms — but watch quality no longer rests on the headline:
  native avg watch (15 s) and the retention curve are in hand.
- Graph API token still expired → automated 24h/72h/7d snapshots still blocked
  (Business Suite manual capture is the current path).

---

## 2. THE THREE GATES (Facebook, now on native data)

| Gate | Verdict | Evidence |
|---|---|---|
| **FB scroll-stop** | **PASS (confirmed)** | Retention holds 100% through 3 s on 35.8K views; recommender keeps widening distribution (~135× typical-post P75, 99.3% recommendations). |
| **FB retention** | **PASS (confirmed)** | 15 s avg watch (76%), 56% completion, ≥92% among 15s+ viewers. Best watch-quality evidence Curio has ever recorded on any platform. |
| **Advocacy** | **WEAK — the one remaining failure** | FB: 4 shares + 8 saves + 0 comments + 0 follows on 35.8K views (~0.03%); IG: 1 like, nothing else. No longer literally zero, but far below Third Man's rates and negligible against this distribution. |

## 3. HYPOTHESES (interpretation — clearly separated)

1. **The frame-zero contradiction drives the stop** — now strongly supported
   (100%-through-3s on FB), though "supported" ≠ causally isolated until REP-4.
2. **The escalation held people**: the only meaningful decay is 3–9 s (during
   the escalation beats), then the curve flattens to a 56% completion.
   The engineered silence at 10 s did NOT dump viewers (tiny kink only).
3. **The AI hand defects did not measurably hurt FB retention.** They remain
   suspect for the ADVOCACY gap (sharing something visibly AI-flawed has social
   cost) — hypothesis, untested.
4. **The procedural ending remains the leading advocacy suspect**: 56% of
   viewers reached the payoff region and almost none shared/saved. REP-4's
   transferable-fact ending is the controlled test.
5. **Platform-audience mismatch hypothesis for IG**: IG sampled a young
   audience (18–34) and stopped; FB found an older male audience that watched
   deeply. Whether the subject is inherently 45+-male-skewed or FB's
   recommender just found the pocket faster is unknown.
6. **Low-res upload** remains a possible IG suppressor (posted file still
   unobtained) — unproven either way; FB's performance shows it did not block
   FB distribution.

## 4. Learning-system state
Two runs today: `learn_mrs3zzdx_012u7gms` (pre-native data) and
**`learn_mrs4z7it_01alt76h`** (after the IG-native corrections: IG likes 1,
reach 113, views 179; 10 new rules, 41 total). The IG stream row was
content-superseded to `met_posted_harrison_okene_5caabc69`. FB-native data
lives in the dataset's `facebookNative` block (the importer's learning stream
remains IG-only by design).

## 5. What happens next
1. **REP-4** (`REP-4-second-trap-brief.md`) tests the advocacy fix with clean
   1080×1920 assets — Codex review, then Leon approval. Nothing posts without it.
2. Keep periodic Business Suite captures while FB growth continues (next:
   +24 h). Renew the Graph API token when convenient for automated snapshots.
3. If the exact uploaded MP4 exists on the phone, supply it to close the
   upload-identity gap.
