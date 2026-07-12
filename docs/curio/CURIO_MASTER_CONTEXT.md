# Curio — master context

**Product:** Curio (trycurio.app) — premium iOS short-form reading app. Full-screen
swipeable "rabbit hole" cards: psychology, mysteries, forgotten history, strange
science, internet culture, books, career/life, money, AI/future, horror, scenario
mode, language learning. Users save, like, share, ask AI to explain deeper,
quiz, translate, follow related ideas. Feed personalizes from behavior.

**Positioning:** "Turn scrolling into rabbit holes worth reading." /
"Stop doomscrolling. Start smart scrolling." / "Real rabbit holes live in Curio."
Curio is for minds that never switch off — the 2:14 a.m. one-more-question people.
It is a better way to scroll, not school. Never: generic learning app, SaaS-y,
cheap AI fact app, bright productivity app, gamified kids app.

**Audience:** 18–40 curious late-night scrollers; Gen Z/Millennial; interested in
psychology, mysteries, strange facts, internet lore; high mute-rate platforms.

**Brand tone:** premium, mysterious, intelligent, cinematic, dark editorial,
emotionally aware, quiet, slightly nostalgic. Apple polish + Kinfolk editorial +
dark curiosity.

**Visual language:** obsidian/espresso black, deep violet/midnight purple, cream
type, subtle violet/orange glow, liquid glass, soft grain, volumetric light,
negative space. Bans: neon/Matrix, RGB split, meme fonts, bouncing captions,
emoji, subtitle boxes, bright stock lifestyle footage, loud color highlights,
readable fake usernames, obvious AI slop.

**App status (keep current):** v1.0 submitted to App Store review 2026-07-08;
TestFlight live. Until approval: CTAs are soft signatures or "Curio is in final
App Store review. Get notified when it opens." Never "download now".

**Content categories (diversity quota applies):** psychology · mystery · history ·
science · technology · AI/internet culture · career · money · books ·
nature/animals · survival · strange everyday mechanisms · visual experiments ·
horror · moral dilemmas · memory/consciousness · hidden systems · abandoned
places · unusual biographies.

**Monetization:** freemium (free/Pro quotas), StoreKit subs on iOS; RevenueCat
scaffolded for Android.

**Social strategy:** IG Reels + TikTok + YouTube Shorts. 80% emotional/editorial,
20% product in organics. Late-night posting windows for dark psychological
content. Manual posting; analytics pasted back into the factory
(`POST /api/performance/ingest`) → weekly learning runs.

**Known strengths:** visual brand, script voice, factory pipeline (generation →
judge → render → review → learning loop).
**Known weaknesses:** hooks historically slower than visuals deserve; share/comment
triggers under-engineered; v1 local renders lacked footage-layer atmosphere and
audio design (see EXPERIMENT_LEDGER + VIRAL_PLAYBOOK).

**This repo:** the video factory (Express/TS, dashboard on :8790). The card
content engine lives in the main `curio` repo; its live counts come from the
production API — do not guess them here.
