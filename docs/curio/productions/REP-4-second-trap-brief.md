# REP-4 — controlled Harrison replication — production brief (DRAFT for Codex review)

Status: **DRAFT 2026-07-19, written by the producer per Leon's directive.
NOT approved. Nothing is generated, rendered, or posted until Codex reviews this
brief and Leon approves the topic.** The live Harrison post stays untouched.

One-outcome declaration: **retention primary, shares secondary** (Curio
default; unchanged from Harrison so the payoff change is measurable).

## 1. What this replication tests (and what it holds constant)

Harrison (EXP-202607-18-01) passed scroll-stop, passed IG-scoped retention,
and **failed advocacy at 26k+ plays (all high-intent actions zero)**. REP-4
keeps the winning architecture and changes exactly TWO variables — both aimed
at the failed gate:

**KEEP (controls — must match Harrison):**
- Frame-zero **impossible human evidence**: the anomaly is complete, human, and
  comprehensible with zero context on the first frame. Caption hard-in at
  frame 0, complete clause (locked caption profile + learning rules).
- **Escalating danger in ONE continuous story** with specific numbers — every
  fact deepens the same predicament; no subject changes, no historical preamble.
- **A second trap after the apparent rescue** (Harrison's strongest beat).
- Runtime **18–21 s** (learning window; Harrison 19.6 s), engineered-silence
  beat, −16 LUFS locked audio master, atmospheric bed, calm documentary VO
  (eleven_v3, rubric ≥80), Nova-style white sans captions, frame-exact caption
  engine, FB crosspost, soft signature CTA only.

**CHANGE (the two test variables):**
1. **Visual credibility**: genuine native **1080×1920** assets end-to-end.
   NO Veo. NO generated hands in contact, NO close human interaction, NO
   malformed anatomy risk: humans appear as distant figures, silhouettes, or
   back-views only; contact is implied by composition, never rendered fingers.
   Stack per the locked 2026-07-17 rule: `gpt-image-1` plates generated at
   native FHD + designed local animation; at most ONE indispensable Seedance-2
   hero-motion clip via vidIQ if the frame-zero anomaly genuinely needs motion.
   Disclose any upscaled plate. Bright enough to READ the factual evidence
   (Harrison's wreck murk hid it).
2. **Transferable-fact ending**: the final beat is a portable, repeatable
   sentence a viewer can send — not procedural closure. Pattern: "the rescue
   itself could have killed him" class of fact, stated as the last card.

Confound note (honest): the subject necessarily changes too. Subject choice is
constrained below to stay inside the same archetype (documented survival,
trapped-human, second-trap structure) to minimize that confound.

## 2. Candidate subjects (Leon picks ONE; all require the factcheck gate first)

A. **Juliane Koepcke (1971)** — frame zero: a teenage girl still strapped into
   an airplane seat row, alone on the rainforest floor. Escalation: fell ~3 km →
   sole survivor → 11 days walking out. Second trap: surviving the FALL was not
   survival — the jungle was the second killer. Transferable fact: the seat row
   she stayed strapped into is credited with her surviving the fall.
   Visual safety: seat + jungle + distant silhouette; zero contact shots.
B. **Avalanche air pocket** — frame zero: a bare airhole in a featureless snow
   face with breath-fog rising from it. Escalation: buried alive → ~15 min
   oxygen window → rescuers probe blind. Second trap: your own exhaled CO2, not
   the snow, is what kills; digging the pocket bigger can collapse it.
   Transferable fact: one hand cupped before the snow sets buys the minutes.
C. **Vesna Vulović (1972)** — frame zero: an intact tail section in a snowy
   forest, one crew seat occupied. Highest fall survived without a parachute
   (~10 km). Second trap: rescuers moving her could have severed her spine.
   (Fact-check flag: serbia/JAT bombing details are contested — the factcheck
   stage decides if this survives.)

Recommendation: **A (Koepcke)** — best documented, cleanest no-contact frame
zero, strongest transferable fact.

## 3. Hard gates (unchanged, structural)
1. `src/factcheck.ts` stage passes BEFORE the creative judge and any render;
   named sources; no invented numbers or dialogue.
2. Audio-first: locked VO + audio story approved before any visual generation;
   ~0.25–0.40 s inter-sentence gaps decided before locking (caption splitting).
3. Every master passes `node tools/finalqa.mjs <mp4>` before ANY reviewer.
4. Caption transcript diffed against the locked script (ASR factual-error gate).
5. One render process, ≤2 threads, RSS <750 MB (8 GB machine doctrine).
6. Package declares primary_outcome=retention / secondary=shares and the exact
   outcome beat; judge must return outcome_verified naming that beat.
7. **Codex reviews the built master; Leon approves; NOTHING POSTS otherwise.**

## 4. Measurement plan (fixes what Harrison's capture missed)
- Platform-separated checkpoints at 24 h / 72 h / 7 d minimum, per
  `ANALYTICS_CAPTURE_TEMPLATE.md` — never a combined Meta total.
- FB-native insights via Graph API (token renewal pending): unique reach,
  3-second views, watch time/retention, completion, recommendation-vs-follower
  split, native shares/comments, Page follows.
- Record the EXACT uploaded file (path + resolution + duration + loudness) in
  the ledger at post time — Harrison's upload identity is permanently
  UNVERIFIED; that must never happen again.
- Success reads: advocacy gate (any nonzero sends/saves/comments/follows on
  comparable distribution) is the primary comparison vs Harrison; IG-scoped
  metrics compare only against IG-scoped, FB-native only against FB-native.
