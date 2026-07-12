# Analytics capture template — one per posted video

Paste-ready. Fill what the platform shows; write `missing` for the rest (never
guess). **IG and FB views MUST be separated** — combined totals are not an
optimization target (FB supplied most views on 3/4 posts while engagement
rates were IG signals). Screenshots of every insights tab (Overview,
Engagement, Audience) go into `samples/Curio Video Stats/<video name>/`
alongside the posted file.

## Distribution
- Instagram views:
- Facebook views:
- Instagram accounts reached:
- Facebook reach:
- Followers vs non-followers reached:
- View sources (Reels / Explore / Feed / Profile / Stories, %):
- Organic vs boosted:
- Posting date + exact time:
- Follower count at posting:

## Retention
- Skip rate:
- Average watch time:
- Total watch time:
- Retention at 1s / 3s:
- Retention at 25% / 50% / 75% / end:
- Completion rate:
- Replay rate (if shown):

## Engagement & conversion
- Likes / comments / shares / saves / reposts (RAW COUNTS):
- Profile visits:
- Follows:
- Link clicks:
- App Store visits / installs (if attributable):

## Creative metadata (filled by the factory automatically for factory renders;
## by hand for external productions)
- Exact first-frame description:
- Exact hook wording:
- Time when the full premise is understandable:
- Time of first payoff:
- Archetype:
- Script:
- Duration / number of scenes / visual-change timestamps:
- Caption style + size:
- Narrator + delivery settings:
- Music/sound assets (registry ids):
- Audio loudness (integrated LUFS + true peak — `ffmpeg -af ebur128=peak=true`):
- CTA wording + duration on screen:
- Renderer version / prompt version / exact model snapshot / seed + asset ids:

## Ingest procedure
1. Drop screenshots + video into `samples/Curio Video Stats/<name>/`.
2. Add the experiment to `data/posted-experiments.json` (machine copy).
3. `npx tsx tools/import_posted_experiments.ts` (idempotent).
4. Add a ledger entry to `docs/curio/EXPERIMENT_LEDGER.md`.
5. `POST /api/learning/run` → record improvementDelta + calibration notes.

Without the creative metadata, we know WHICH video won but not which
production decision caused it — capture both or the experiment is wasted.
