# Curio faceless founder-journal engine

Status: initial strategy and generator contract, 2026-07-20.

## The 30/70 system

Across each ten-post production cycle:

- **7 curiosity stories — Rabbit Hole Daily.** The existing evidence-first
  curiosity engine: true survival, strange science, psychology, and controlled
  experiments.
- **3 founder journals — Curio main.** First-person product stories, build
  decisions, honest struggles, mistakes, and progress.

The existing seven-day curiosity map stays intact. The founder layer adds three
Curio-main posts around it; it does not replace or contaminate the curiosity
experiments.

The founder account is not a second education feed. Rabbit Hole Daily earns
attention with the subject. Curio main earns trust in the person and product
thinking behind it.

## Format decision: founder-led without founder footage

These videos use **founder point of view without showing the founder**.
Authenticity comes from true specificity and visible evidence—not a face.

Use:

- clean Curio screen recordings;
- UI before/after states;
- card-quality iterations;
- redacted build notes, issue lists, or code/build artifacts;
- real analytics only when their exact platform and meaning are clear;
- typography for short connective beats;
- at most two brief generated object/environment plates for atmosphere.

Do not use:

- a synthetic founder face, generic AI spokesperson, or stock "young founder";
- fake hands typing, fake office footage, fake team meetings, or fake user DMs;
- generic code montages that prove nothing;
- invented time spent, user counts, revenue, launch status, quotes, setbacks,
  or emotions;
- an AI visual that presents a fictional event as documentary evidence.

If narration is synthetic, the first-person words must be founder-supplied and
approved, and the applicable platform AI label must be enabled. The voice is a
delivery tool, not evidence.

## Three rotating pillars

1. **Why Curio exists.** A personal behavior or contradiction that created the
   product thesis.
2. **The invisible build decision.** One choice, mistake, quality problem, or
   iteration shown with real product proof.
3. **The honest present struggle.** Discovery, positioning, retention, or a
   decision that is genuinely unresolved—without manufacturing failure drama.

This prevents every founder video from retelling the same origin story.

## Story architecture

**Personal contradiction → visible proof → product idea → honest struggle →
journey invitation**

- 0–2s: complete first-person contradiction and real Curio evidence on screen.
- 2–8s: the personal problem, one ordinary detail rather than a grand mission.
- 8–18s: the product decision, proven with UI/build artifacts.
- 18–27s: the honest tension or tradeoff now.
- Final beat: "I'm documenting what happens next" energy; no download demand.

Target 20–35 seconds. New evidence or a meaningful screen state approximately
every 1.5–2.5 seconds, but comprehension outranks the timer. Crops do not count
as new evidence.

## First concept bank

### 1. The scroll I wanted did not exist

Hook: **"I loved scrolling. I hated remembering none of it."**

Show the Curio feed immediately. Contrast the pleasure of falling into rabbit
holes with the empty feeling afterward, then reveal the product thesis: keep
the effortless motion, replace the emptiness. End on the real present tension:
the product can exist before people know it exists.

Required proof: Curio feed capture, a card-to-related-topic flow, one real build
artifact, and founder approval of the discovery-struggle line.

### 2. I almost made Curio feel like homework

Hook: **"The first version solved the wrong problem."**

Only use this if a real early UI or product decision supports it. Show the
before state, name what felt heavy, then show the exact change that restored the
effortless-scroll feeling.

### 3. The AI-card problem nobody sees

Hook: **"Making AI write facts was easy. Making them worth reading wasn't."**

Use a real bad-to-good card comparison. Point to one concrete quality defect:
generic wording, unsupported certainty, weak sourcing, or a flat opening. Do not
claim hours, months, or iteration counts unless documented.

### 4. Building was not the last hard part

Hook: **"The app is built. Getting anyone to care is harder."**

This is the honest-struggle pillar. It needs a real, correctly interpreted
discovery artifact or should stay at the level of the founder's approved
experience. Do not turn low early reach into fake catastrophe.

### 5. The tiny decision that changed the feed

Hook: **"This looks like a small UI choice. It changed the whole feeling."**

Choose one visible decision—card density, transition, related-topic behavior,
save interaction, or typography—and demonstrate it with a real before/after.

### 6. What I refuse to ship as a Curio card

Hook: **"A fact can be true and still not be worth showing you."**

Show a rejected generic card beside an approved one and explain the quality
standard. This makes the invisible product work legible without listing
features.

## First-video production seed

Use this as the generator input after correcting any line that is not literally
true:

> I loved falling into online rabbit holes, but hated the feeling after a long
> scroll when I realized I remembered almost nothing. Educational apps felt
> like homework. I built Curio around a different idea: scrolling should still
> feel effortless, but it should leave an idea behind. I spent a lot of the
> build improving the AI-generated cards so they felt factual, specific, and
> worth reading. The product exists; getting people to discover and care about
> it is now the hard part.

Supply as proof points only facts that can ship. Supply these assets if they
exist:

- 9:16 Curio feed screen recording;
- one card opening into a related rabbit hole;
- one real weak-card/strong-card comparison;
- one redacted build note or issue artifact;
- one correctly interpreted discovery screenshot, or omit that proof beat.

## Generator contract

`POST /api/founder-videos/kit` creates and persists an edit kit. It returns:

- 4–6 hooks and one selected hook;
- narration master;
- 5–12 evidence-led edit beats;
- caption groups;
- proof requirements and asset checklist;
- post caption and journey invitation;
- AI disclosure note;
- verification blockers;
- one primary outcome, optional secondary outcome, and exact outcome moment.

The route deliberately does not render. Final production still needs the real
Curio captures/artifacts, approved narration, edit assembly, captions, and the
full `finalqa.mjs` gate before review.
