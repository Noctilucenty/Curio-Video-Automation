# Curio autopilot + reviewer protocol

Status: **MANDATORY startup contract for every content session.**

This document defines how the producer (Claude/Fable), reviewer (Codex), and
owner (Leon) collaborate from topic discovery through analytics. It does not
replace:

- `CURIO_MASTER_CONTEXT.md` — brand and audience;
- `VIRAL_PLAYBOOK.md` — evidence-tiered creative strategy;
- `PRODUCTION_DOCTRINE.md` — locked technical and production-defect rules;
- a production-specific brief — verified claims, approved script, and shot plan.

The root `CLAUDE.md` requires this file to be read before any video work.

If this protocol conflicts with `PRODUCTION_DOCTRINE.md` or a current locked
profile, the doctrine/profile wins. Correct this protocol in the same session so
the conflict cannot recur.

## 1. Roles and authority

### Producer — Claude/Fable

- Own the complete execution: research, claim map, script, narration, audio
  story, visual generation, assembly, captions, QA, exports, and production log.
- Use the strongest available model for judgment-heavy work. Quality is more
  important than token/API cost until Leon changes that policy.
- Stronger models must produce better selection and restraint, not more effects,
  words, cuts, emotion tags, or decoration.
- Self-rank candidates and repair objective defects autonomously. Do not ask
  Leon to direct individual shots or caption phrases.
- Never claim that Codex reviewed or approved an artifact unless Codex actually
  inspected that exact file and issued the verdict in the current lineage.

### Reviewer — Codex

- Acts as an independent editorial, factual, audiovisual, and retention gate.
- Inspects the actual artifact, source packet, measurements, and lineage; a
  producer's self-review is evidence to check, not a verdict to repeat.
- Leads with a blunt `GO`, `HOLD`, or `REJECT`, then names the smallest set of
  causal blockers. Separate objective defects from creative hypotheses.
- May research topics, make the editorial recommendation, and draft the producer
  prompt when Leon requests it. Disclose any Codex-authored brief or script; the
  later verdict must still inspect the producer's exact artifact independently.
- Does not edit production code or generate the video unless Leon explicitly
  authorizes that work. Documentation may be updated when explicitly requested.
- Never certifies tone, loop quality, or emotional continuity from metrics alone.
  Use the strongest available audio-capable judge for actual listening; metrics
  are supporting evidence. Escalate to Leon only when a high-risk ambiguity
  remains unresolved.

### Owner — Leon

- Chooses business direction and resolves genuinely subjective tone/voice calls
  only when the producer cannot resolve them with an audio-capable judge.
- Approves irreversible actions and posting.
- Is not a manual editor in the automation loop. Routine visual/caption choices
  belong to the producer and its self-review.

## 2. Evidence discipline

Every statement belongs to one evidence class:

- **OBSERVED:** directly visible/measured in an artifact, screenshot, API result,
  or source.
- **DERIVED:** computed from observed data; formula and uncertainty recorded.
- **CONFIRMED:** supported by repeated Curio results or the playbook's stated
  multi-source threshold.
- **PROVISIONAL:** credible external pattern, one Curio result, or creative
  hypothesis awaiting repeated analytics.
- **REJECTED:** disproven strategy or an objective production defect. Rejection
  scope must be explicit; one bad execution does not automatically reject a topic
  or format.
- **UNVERIFIED:** unknown or unavailable. Never silently promote it to fact.

vidIQ is the live external research layer. Its outliers/trends guide topic and
packaging hypotheses, but never prove that Curio's execution will perform.
Persist material findings with collection date, query, video ID, views, channel
size, breakout score, engagement, and why the pattern matters.

For factual content, build a claim map from authoritative sources before creative
generation. Dramatic framing may intensify verified facts; it may not invent
facts, certainty, dialogue, motives, or supernatural causes.

## 3. Outcome and topic gate

Each video declares:

- one primary outcome;
- at most one secondary outcome;
- the exact beat intended to cause each outcome.

Curio's default is **retention primary, shares secondary**. Do not stack separate
"psychology effects" for comments, saves, likes, and shares. Low cognitive load,
clear causality, factual novelty, tension, and a transferable payoff should make
the response natural.

Before selection, score candidate topics on:

1. frame-zero contradiction;
2. factual strength and novelty;
3. emotional tension without unsupported horror;
4. visual teachability at phone size;
5. escalating evidence or consequences;
6. strength of the final learned payoff;
7. social transferability ("I need to tell someone this");
8. production feasibility and continuity risk;
9. category diversity;
10. external outlier evidence.

The reviewer makes the editorial recommendation before drafting the producer
prompt when Leon assigns that role. Once Leon selects the topic, the producer
owns execution and keeps the production brief current.

## 4. Script architecture

- Frame zero contains the complete anomaly in roughly 4–8 plain words.
- Never open on date, location, biography, scenery, or generic atmosphere.
- Withhold the explanation/name, not the premise.
- One spoken thought per sentence; ordinary language; no abstract throat-clearing.
- Every beat must add evidence, consequence, or a new contradiction.
- Use micro-payoffs throughout; do not save all value for the ending.
- Reveal percentage is a heuristic, never a padding target.
- The ending must teach or reframe something materially stronger than the setup.
- Use a semantic loop only when the final idea naturally reopens the first line.
- Verify pronunciation of unfamiliar names before narration.

The script gate checks factual mapping, cold-viewer comprehension, wow factor,
estimated spoken duration, and whether the payoff is socially repeatable.

## 5. Audio-first production gate

No paid visuals before the audio story passes.

### Narration

- ElevenLabs **v3** is the standing narration model. Do not fall back to
  `eleven_multilingual_v2` without explicit approval.
- Generate the emotional arc as one continuous block. Sentence-by-sentence TTS
  creates prosodic resets and is rejected.
- Use minimal emotion direction; emotion tags must not be spoken and must not
  fragment the delivery.
- Produce at most two continuous MP3 takes, self-rank them, recommend one, and
  provide clickable links. Judge comprehension, pronunciation, continuity,
  tension, naturalness, and payoff authority—not WPM alone.
- **The producer chooses the take.** Do not ask Leon to compare routine A/B
  narration. Reject any take with wrong wording, audible tag leakage, a material
  artifact, unresolved name pronunciation, clipping, or an unmotivated reset.
  Score remaining takes: comprehension/prosodic continuity 35, tension and
  naturalness 25, first-three-second hook authority 20, payoff authority 15,
  and timing/cadence 5. Require at least 80/100. Within three points, choose the
  simpler, more continuous read. If neither passes, regenerate; do not delegate
  the selection back to Leon.
- Preserve and link both candidates for audit, record the score and rationale,
  lock the winner, and proceed directly to the complete audio story. A routine
  narration comparison is no longer a human-visible stop.

### Complete audio story

After autonomous narration selection, build the bed, event-driven sound design, reveal
collapse, and loop. Deliver:

- MP3 preview;
- lossless WAV master;
- loop×2 MP3 audition with two byte-identical copies back-to-back;
- stems when relevant;
- duration, LUFS, true peak, clipping, silence, reveal timing, and seam-window
  measurements.

Tension comes from accumulating audible events and state changes, not a flat
drone. A loop seam must pass measurement and an audio-capable listening audit;
escalate only an unresolved seam to Leon. Do not flatten the opening hook merely
to optimize a seam number.

## 6. Fast visual production mode

Once audio is locked, the producer works end to end without shot-by-shot
approval:

1. establish one coherent visual world;
2. generate/select the necessary hero actions;
3. assemble one complete low-resolution clean preview with locked audio;
4. self-review it at compressed 270×480 playback size;
5. perform at most one focused correction pass unless a genuine blocker remains;
6. return one best preview, limitations, and clickable links.

Requirements:

- Every shot teaches the mute viewer something new.
- Crops and punch-ins are shot grammar, not new story beats.
- Chain generated clips from the preceding clip's accepted end frame when scene
  continuity matters.
- Keep identities, wardrobe, geography, lighting, screen direction, and physical
  state consistent.
- Visual causes land on their audible causes.
- Inspect motion, anatomy, hands, faces, text, morphing, and late-clip overshoot.
- Do not fill runtime with freezes, inert tails, generic darkness, fake UI, or
  repeated footage.
- Keep essential evidence clear of the future caption band.
- Actual archive footage, photographs, music, and likeness references require a
  source/license entry. Otherwise use an explicitly disclosed reenactment.

## 7. Independent reviewer gate

The reviewer opens the exact delivered preview and checks:

### First three seconds

- Is the contradiction complete and visible at frame zero?
- Can a muted cold viewer understand the premise immediately?
- Does meaningful development begin before context/explanation?

### Story and cognition

- Is the script one escalating thought rather than disconnected facts?
- Does each visual state add evidence or consequence?
- Are cause and effect unmistakable without narration?
- Is the payoff worth the wait and easy to repeat to another person?

### Craft and integrity

- Character/object/location continuity;
- factual and medical/physical plausibility;
- mobile readability and darkness floor;
- anatomy, morphing, matte, crop, UI, and generated-text defects;
- audio continuity, dynamics, reveal collapse, and loop seam;
- caption safety and archive/license provenance;
- lineage: exact script, narration, mix, and master being reviewed.

Automated QA passing is necessary but never substitutes for the creative gate.
The reviewer must not approve from a contact sheet alone when motion or sound is
material.

Reviewer verdict format:

1. `GO`, `HOLD`, or `REJECT`;
2. strongest working mechanism;
3. blocking defects only, ordered by expected retention/credibility impact;
4. exact correction scope and what must remain locked;
5. whether the next gate is captions, another preview, or stop.

## 8. Caption finishing gate

Captions.ai is Leon's preferred final caption layer when its capability gate
passes. Before each job, read
`docs/curio/profiles/locked_master_retention_captions.json` and verify that the
current app/API can preserve the locked timeline, silence, and variable groups.
If it cannot, report the exact limitation; use the profile-driven custom engine
only with Leon's approval. Never silently substitute a tool or degrade the
caption contract.

- Caption-only: disable trim, filler/silence cutting, restructuring, reframing,
  B-roll replacement, and scene editing.
- Preserve the locked master timeline and audio.
- Use the current appearance in the locked caption profile. As of 2026-07-17,
  new videos use a bold clean sans, near-white inactive text, one restrained
  amber-cream active word, and a stable lower-center position.
- Use low-cognitive 2–4-word groups, no more than two lines.
- Highlight changes guide reading; they must not strobe on function words.
- Intentional silence stays caption-free.
- A reveal caption never appears before the spoken/visual reveal.
- Clear the final caption when its final word ends so the loop can close.
- Verify cropping, orphan words, collisions, safe area, duration, audio lag,
  loudness, reveal timing, silence, and sequence integrity.

The producer automates this pass and self-corrects routine caption defects. Leon
does not manually move phrases one by one.

## 9. Native export and pre-post gate

After caption verification:

- read the latest production-log entry and verify that the caption input is the
  current canonical master, not merely the newest-looking filename;
- retain the clean locked master;
- export native 1080×1920 at the source cadence;
- create a separate 1080×1920/60fps delivery by frame duplication only when the
  source is lower cadence—never interpolate generated faces;
- use 4K only when the source and tool genuinely support it;
- faststart, ffprobe, full-decode, transcript, audio, loop, and caption checks;
- provide clickable links and an honest source-resolution disclosure.

Nothing posts automatically. Leon chooses the file and authorizes posting after
the final reviewer gate.

## 10. Analytics and self-training

Capture each platform separately at 24h, 72h, and 7d when available:

- views and reach;
- average watch and retention curve;
- skip/completion/rewatch where supplied;
- likes, comments, shares, saves, reposts, follows;
- view sources and follower/non-follower split;
- exact posted file, caption, cover, posting time, platform, and provenance.

Record observed outcomes before explaining them. Causal explanations remain
PROVISIONAL unless repeated evidence supports them. Inspect importer diffs before
running learning. Never allow estimated metrics to masquerade as real data.

Update only the canonical stores named in `CLAUDE.md`. Do not create duplicate
lesson documents. Technical defects can lock immediately; retention and virality
rules require analytics under the playbook's promotion standard.

## 11. Speed policy

For a selected topic, human-visible phases are intentionally limited:

1. approved concept/script;
2. audio-first phase:
   - producer self-selects and locks narration using the scored rubric, then
     builds the bed/SFX/loop without asking Leon to choose a take;
   - complete audio-story review remains the single pre-visual audio stop; no
     paid visuals before it passes;
3. complete low-resolution audiovisual preview;
4. final captioned/native pre-post package.

Do research, candidate ranking, routine generation choices, caption grouping,
technical verification, and objective corrections autonomously between gates.
Speed comes from fewer meaningful gates and coherent source material—not from
skipping facts, audio approval, mobile review, or final QA.
