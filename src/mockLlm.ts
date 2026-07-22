// Offline stand-in for OpenAI. Not lorem ipsum: the package generator writes
// plausible Curio-voice output and the judge actually applies the rubric
// (banned phrases, caption word counts, hook length), so the full pipeline —
// including the fail->rewrite loop — behaves realistically without a key.

import type { JsonRequest } from "./llm.js";

const BANNED = [
  "did you know", "here are", "unlock your potential", "like and follow",
  "meet curio", "introducing curio", "download now", "try curio now",
  "the best learning app",
];

export function mockGenerate(req: JsonRequest): unknown {
  switch (req.purpose) {
    case "package": return req.schemaName === "curio_founder_video_kit"
      ? mockFounderKit(req.user)
      : mockPackage(req.user);
    case "judge": return mockJudge(req.user);
    case "factcheck": return mockFactcheck(req.user);
    case "learning": return mockLearning(req.user);
    case "ingest": return mockIngest(req.user);
  }
}

function mockFounderKit(user: string): unknown {
  const jsonStart = user.indexOf("{");
  let input: any = {};
  try { input = JSON.parse(user.slice(jsonStart)); } catch { /* deterministic fallback */ }
  const length = Math.max(20, Math.min(35, Number(input.target_length_seconds) || 30));
  const hook = "I loved scrolling. I hated remembering none of it.";
  const script = [
    hook,
    "I could lose half an hour in a rabbit hole and come away with nothing.",
    "Educational apps felt like homework, so I kept opening the empty feed instead.",
    "That contradiction became Curio: scrolling that still feels effortless, but leaves an idea behind.",
    "Building it was the manageable part. Getting anyone to notice it is the part I am learning now.",
    "I'm documenting what happens next.",
  ].join(" ");
  const beats = [
    [0, 3.5, hook, "Open on a real Curio feed screen recording already mid-scroll.", "NOTHING STUCK", "app_capture", "Show the problem and product on frame zero."],
    [3.5, 8, "I could lose half an hour in a rabbit hole and come away with nothing.", "Show a neutral scrolling timeline, then cut to an empty notes/search state; do not show a fake social account.", "30 MINUTES. NOTHING.", "typography", "Make the personal frustration concrete."],
    [8, 13, "Educational apps felt like homework, so I kept opening the empty feed instead.", "Use two real Curio UI iterations or supplied product notes, not a generic classroom image.", "LEARNING FELT LIKE WORK", "build_artifact", "Establish the category tension."],
    [13, 19, "That contradiction became Curio: scrolling that still feels effortless, but leaves an idea behind.", "Screen-record one Curio card opening into a related rabbit hole.", "SCROLLING THAT LEAVES SOMETHING", "app_capture", "Prove the product idea visually."],
    [19, 26, "Building it was the manageable part. Getting anyone to notice it is the part I am learning now.", "Show a redacted build artifact followed by an honest low-discovery proof screenshot only if supplied.", "DISCOVERY IS HARDER", "proof_screenshot", "Land the vulnerable present-tense struggle."],
    [26, length, "I'm documenting what happens next.", "Return to the Curio feed and end on continued motion; small Curio wordmark only if loop-safe.", "WHAT HAPPENS NEXT", "app_capture", "Invite the viewer into the build without a sales push."],
  ];
  const captionSeeds = [
    ["I loved scrolling", "loved scrolling"],
    ["But remembered nothing", "nothing"],
    ["Learning felt like homework", "homework"],
    ["So I built Curio", "built Curio"],
    ["Scrolling should feel effortless", "feel effortless"],
    ["And leave an idea behind", "leave an idea"],
    ["Building was manageable", "manageable"],
    ["Discovery is harder", "harder"],
    ["I'm documenting what happens next", "what happens next"],
  ];
  return {
    concept_title: "The scroll I wanted did not exist",
    pillar: "why_curio_exists",
    hook_options: [
      hook,
      "I built Curio because my favorite habit felt completely empty.",
      "I wanted to keep scrolling without wasting the hour.",
      "The app was easier to build than getting anyone to care about it.",
      "Curio started with a problem I kept pretending I didn't have.",
    ],
    selected_hook: hook,
    story_promise: "Why a familiar scrolling regret became Curio, and why discovery is now the harder problem.",
    narration_script: script,
    edit_beats: beats.map(([start, end, narration, visual, overlay, asset, purpose]) => ({
      start_hint: start, end_hint: end, narration, visual, overlay_text: overlay,
      asset_type: asset, purpose,
    })),
    caption_lines: captionSeeds.map(([text, emphasis], i) => ({
      start_hint: round1(i * length / captionSeeds.length),
      end_hint: round1((i + 1) * length / captionSeeds.length),
      text, emphasis,
      position: "lower_center", style: "curio_premium",
    })),
    proof_requirements: [
      { claim: "Curio turns scrolling into connected ideas worth remembering.", evidence: "Real app capture showing feed card to related rabbit hole.", blocking: true },
      { claim: "Discovery is currently harder than building.", evidence: "Founder approval; optionally a redacted real discovery/analytics artifact.", blocking: true },
    ],
    asset_checklist: [
      { asset: "Clean 9:16 Curio feed screen recording", source: "curio_capture", required: true },
      { asset: "Curio card-to-related-rabbit-hole screen recording", source: "curio_capture", required: true },
      { asset: "One real UI iteration or build note with private data removed", source: "founder_supplied", required: true },
      { asset: "Optional abstract phone/desk atmosphere plate with no person", source: "generated", required: false },
    ],
    post_caption: "I didn't want to stop scrolling. I wanted the scroll to leave something behind. Building Curio answered one problem; getting it discovered is the next one. I'm documenting that part here.",
    hashtags: ["#BuildInPublic", "#IndieApp", "#CurioApp", "#ProductJourney"],
    invitation_cta: "I'm documenting what happens next.",
    disclosure_note: input.delivery_mode === "synthetic_voiceover"
      ? "Use the applicable AI-generated-content label for synthetic narration and any generated b-roll."
      : "Disclose any generated b-roll on platforms that require it.",
    verification_needed: [
      "Confirm that 'building was the manageable part' accurately reflects the founder's experience.",
      "Supply a real artifact before using the discovery-struggle visual beat.",
    ],
    primary_outcome: "comments",
    secondary_outcome: "shares",
    outcome_moment: "At ~20s, the admission that discovery is harder than building gives other builders a specific struggle to identify with.",
    estimated_length_seconds: length,
  };
}

/**
 * Offline fact-checker: flags the same tells the real prompt bans ("studies
 * show" filler, invented-stat smell). The deterministic contested-claims
 * screen runs BEFORE any LLM call, so the mock only needs to exercise the
 * LLM-pass plumbing + the fail path.
 */
function mockFactcheck(user: string): unknown {
  const lower = user.toLowerCase();
  const findings: any[] = [];
  if (/studies show|scientists say|research proves/.test(lower)) {
    findings.push({
      claim: "unattributed 'studies show' claim",
      verdict: "unsupported",
      issue: "cites studies without naming any",
      required_fix: "Name the researcher/study or drop the claim.",
    });
  }
  const pass = findings.length === 0;
  return { findings, pass, fix: pass ? "" : findings[0].required_fix };
}

/**
 * Offline analytics parser: handles `key=value` token lines and simple CSV with
 * a header row — enough for dev/tests. The real LLM handles arbitrary pasted
 * platform text; this keeps the ingest endpoint fully functional without a key.
 */
function mockIngest(user: string): unknown {
  const raw = user.slice(user.indexOf("RAW ANALYTICS:") + "RAW ANALYTICS:".length).trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: any[] = [];

  const NUMERIC = new Set([
    "views", "reach", "avg_watch_time", "completion_rate", "skip_rate", "likes", "comments",
    "shares", "saves", "follows", "profile_clicks", "app_downloads", "posted_at",
  ]);
  const finish = (fields: Record<string, string>) => {
    if (Object.keys(fields).length === 0) return;
    const entry: any = {
      match_hint: {},
      views: 0, likes: 0, comments: 0, shares: 0, saves: 0,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (k === "video_id" || k === "hook" || k === "title") entry.match_hint[k] = v;
      else if (k === "platform") entry.platform = v;
      else if (k === "surface") entry.surface = v;
      else if (NUMERIC.has(k)) entry[k] = Number(v.replace(/[%,]/g, ""));
    }
    entries.push(entry);
  };

  // CSV mode: first line looks like a header containing "views".
  const header = lines[0]?.toLowerCase().split(",").map((h) => h.trim());
  if (header && header.includes("views") && lines.length > 1) {
    for (const line of lines.slice(1)) {
      const cells = line.split(",").map((c) => c.trim());
      const fields: Record<string, string> = {};
      header.forEach((h, i) => { if (cells[i] !== undefined && cells[i] !== "") fields[h] = cells[i]; });
      finish(fields);
    }
    return { entries };
  }

  // key=value token mode, one video per line (values may be "quoted").
  for (const line of lines) {
    const fields: Record<string, string> = {};
    const re = /(\w+)=("([^"]*)"|\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) fields[m[1].toLowerCase()] = m[3] ?? m[2];
    finish(fields);
  }
  return { entries };
}

function field(user: string, name: string): string {
  const m = user.match(new RegExp(`^${name}: (.*)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

function mockPackage(user: string): unknown {
  const topic = field(user, "Topic") || "Why your brain remembers pain better than praise";
  const category = field(user, "Category") || "psychology";
  const platform = (field(user, "Platform") || "tiktok").toLowerCase();
  const length = Number(field(user, "Target length").replace(/s$/, "")) || 15;
  const isRewrite = user.includes("previous attempt failed");

  const subject = topic.replace(/^(why|how|what)\s+/i, "").replace(/[?.]$/, "");
  // Keep hooks bounded so the rubric judge (hook <= 14 words) stays satisfiable
  // regardless of how long the input topic string is.
  const shortSubject = firstWords(subject, 6);
  const hook = isRewrite
    ? `${cap(shortSubject)} — and it changes how you scroll.`
    : `${cap(firstWords(subject, 8))}. That's not an accident.`;

  const scriptBeats = [
    hook,
    `For most of human history, missing this detail was expensive.`,
    `So your mind built a shortcut — fast, automatic, invisible.`,
    `Scientists call it a bias. You experience it as "just how things are".`,
    `But once you can see the mechanism, it loses its grip.`,
    `The strange part? Noticing it is most of the fix.`,
    `Curio turns scrolling into things worth remembering.`,
  ];

  const captionSeeds = [
    { text: firstWords(hook, 6), emphasis: firstWords(subject, 2) },
    { text: "Missing this used to be expensive.", emphasis: "expensive" },
    { text: "So your mind built a shortcut.", emphasis: "shortcut" },
    { text: "Fast. Automatic. Invisible.", emphasis: "Invisible" },
    { text: "But here's the strange part...", emphasis: "strange part" },
    { text: "Noticing it is most of the fix.", emphasis: "Noticing" },
    { text: "Save this before it scrolls away.", emphasis: "Save this" },
  ];

  let cursor = 0;
  const captionLines = captionSeeds.map((c) => {
    const words = c.text.split(/\s+/).length;
    const dur = Math.max(1.2, Math.min(3.2, words / 2.6));
    const line = {
      start_hint: round1(cursor),
      end_hint: round1(cursor + dur),
      text: c.text,
      emphasis: c.emphasis,
      position: "lower_center",
      style: "curio_premium",
    };
    cursor += dur;
    return line;
  });

  return {
    topic,
    category,
    target_platform: platform,
    hook_options: [
      hook,
      `Nobody teaches you this about ${lower(firstWords(subject, 4))}.`,
      `${cap(firstWords(subject, 5))} is a survival feature.`,
      `Your brain lies to you about ${lower(firstWords(subject, 4))}.`,
      `There's a reason ${lower(firstWords(subject, 5))}.`,
    ],
    selected_hook: hook,
    script: scriptBeats.join(" "),
    scene_direction: "Dark editorial studio, slow push-in on avatar, moody rim light, occasional abstract b-roll of neural imagery. Minimal movement; let the words carry tension.",
    avatar_tone: "calm, premium, mysterious",
    caption_lines: captionLines,
    title: cap(firstWords(topic, 8)),
    thumbnail_text: cap(firstWords(subject, 4)),
    post_caption: `${hook} Some things are too interesting to scroll past. More rabbit holes like this live in Curio.`,
    hashtags: ["#psychology", "#rabbithole", "#strangefacts", "#curio"],
    cta: "GO DEEPER WITH CURIO",
    estimated_length_seconds: length,
    // One-outcome doctrine (Curio default: retention primary, shares secondary).
    primary_outcome: "retention",
    secondary_outcome: "shares",
    outcome_moment: `the twist beat at ~60%: "But here's the strange part..." holds the viewer through the mechanism reveal`,
  };
}

/** Heuristic rubric judge over the package JSON embedded in the prompt. */
function mockJudge(user: string): unknown {
  const jsonStart = user.indexOf("{");
  let pkg: any = {};
  try { pkg = JSON.parse(user.slice(jsonStart)); } catch { /* score the void */ }

  const problems: string[] = [];
  const text = `${pkg.selected_hook ?? ""} ${pkg.script ?? ""} ${pkg.post_caption ?? ""}`.toLowerCase();

  let brandFit = 9;
  for (const b of BANNED) {
    if (text.includes(b)) { brandFit = 3; problems.push(`banned phrase: "${b}"`); }
  }

  const hookWords = String(pkg.selected_hook ?? "").split(/\s+/).filter(Boolean).length;
  let hookScore = 9;
  if (hookWords === 0) { hookScore = 1; problems.push("missing hook"); }
  else if (hookWords > 14) { hookScore = 6; problems.push("hook too long to land in 1.5s"); }

  const lines: any[] = Array.isArray(pkg.caption_lines) ? pkg.caption_lines : [];
  let captionReadability = 9;
  const longLines = lines.filter((l) => String(l.text ?? "").split(/\s+/).length > 7);
  if (lines.length === 0) { captionReadability = 2; problems.push("no caption lines"); }
  else if (longLines.length > 0) {
    captionReadability = 5;
    problems.push(`${longLines.length} caption line(s) exceed 7 words`);
  }

  const scriptWords = String(pkg.script ?? "").split(/\s+/).filter(Boolean).length;
  let retention = 8;
  if (scriptWords > 140) { retention = 6; problems.push("script too long; middle will sag"); }

  // Fillers get cut in post anyway — a script that needs cutting loses clarity.
  let clarity = 8;
  const fillers = String(pkg.script ?? "").match(/\b(basically|actually|you know|kind of|sort of|literally)\b/gi);
  if (fillers && fillers.length > 0) {
    clarity = 6;
    problems.push(`filler words in script: ${[...new Set(fillers.map((f: string) => f.toLowerCase()))].join(", ")}`);
  }

  const factualSafety = /\d{2,}%|studies show|scientists proved/.test(text) ? 6 : 9;
  if (factualSafety < 8) problems.push("unverifiable stat/claim phrasing");

  const viral = Math.min(9, Math.round((hookScore + retention) / 2));
  const overall = Math.round(
    (hookScore + retention + clarity + captionReadability + brandFit + viral + factualSafety) / 7,
  );

  // One-outcome check: a declared outcome with a concrete moment verifies; a
  // missing/vague declaration fails the machine-enforced verdict (mirrors the
  // real judge's rule — outcome_verified=false blocks pass in meetsThresholds).
  const declaredOutcome = typeof pkg.primary_outcome === "string" ? pkg.primary_outcome : "";
  const declaredMoment = typeof pkg.outcome_moment === "string" ? pkg.outcome_moment : "";
  const outcomeVerified = Boolean(declaredOutcome) && declaredMoment.length >= 15;
  const outcomeCheck = outcomeVerified
    ? `intended outcome ${declaredOutcome}; produced by: ${declaredMoment}`
    : "no concrete outcome moment declared — cannot verify the mechanism";
  if (!outcomeVerified) problems.push("missing/vague primary outcome moment");

  return {
    hook_score: hookScore,
    retention_score: retention,
    clarity_score: clarity,
    caption_readability: captionReadability,
    brand_fit: brandFit,
    viral_potential: viral,
    factual_safety: factualSafety,
    overall_score: overall,
    outcome_verified: outcomeVerified,
    outcome_check: outcomeCheck,
    problems,
    fix: problems.length
      ? "Shorten the hook to one tension line, keep every caption under 7 words, remove banned phrasing, and add a second curiosity turn at the 60% mark."
      : "No changes required.",
  };
}

function mockLearning(user: string): unknown {
  let payload: any = {};
  const jsonStart = user.indexOf("{");
  try { payload = JSON.parse(user.slice(jsonStart)); } catch { /* empty */ }
  // v2 payload nests current-batch data under `current`; tolerate the old flat shape.
  const current = payload.current ?? payload;
  const winners: any[] = current.top_videos ?? [];
  const losers: any[] = current.bottom_videos ?? [];
  const platforms: Record<string, any> = current.platforms ?? {};
  const judgeVsActual: any[] = payload.judge_vs_actual ?? [];
  const ruleValidation: any[] = payload.rule_validation ?? [];

  const avgHookLen = (vs: any[]) =>
    vs.length ? vs.reduce((s, v) => s + String(v.hook ?? "").split(/\s+/).length, 0) / vs.length : 0;
  const winnerCats = [...new Set(winners.map((v) => v.category).filter(Boolean))] as string[];
  const winLen = winners.length
    ? Math.round(winners.reduce((s, v) => s + (v.length_seconds ?? 28), 0) / winners.length)
    : 28;

  // Deterministic mock of the judge-vs-actual analysis: flag overpredictions
  // (judge said >=8 viral but the video landed in the bottom half).
  const overpredicted = judgeVsActual.filter(
    (j) => (j.judged_viral_potential ?? 0) >= 8 && (j.actual_percentile ?? 100) < 50,
  );
  const validatedRules = ruleValidation.filter(
    (r) => (r.cohort_avg_engagement ?? 0) >= (r.baseline_avg_engagement ?? 0),
  );

  return {
    top_patterns: [
      `Winning hooks average ${Math.round(avgHookLen(winners))} words and state a tension, not a question`,
      `Winning categories: ${winnerCats.join(", ") || "psychology"}`,
      "Winners place an emotional reframe in the final third",
      ...(validatedRules.length
        ? [`Validated rules from prior runs: ${validatedRules.length} of ${ruleValidation.length} beat baseline`]
        : []),
    ],
    weak_patterns: [
      `Losing hooks average ${Math.round(avgHookLen(losers))} words or open with context instead of tension`,
      "Losers explain past the 18s mark without a second curiosity turn",
    ],
    platform_notes: Object.keys(platforms).length
      ? Object.entries(platforms).map(
          ([p, agg]: [string, any]) =>
            `${p}: n=${agg.n}, avg completion ${agg.avg_completion} — ${p === "shorts" ? "tolerates slower narrative" : "cut cognitive load, reveal faster"}`,
        )
      : ["tiktok: reveal the mystery in line one, keep under 16s"],
    judge_calibration_notes: overpredicted.length
      ? [`viral_potential overpredicted on ${overpredicted.length} video(s) that landed in the bottom half`]
      : ["judge predictions roughly tracked actual engagement this batch"],
    hook_formulas: [
      "[Familiar thing] is actually [hidden mechanism].",
      "Your brain treats [modern thing] like [ancient threat].",
      "[Surprising claim]. That's not an accident.",
      "Nobody teaches you this about [topic].",
      "[Common belief] is backwards.",
      "There's a reason you [relatable behavior].",
      "[Authority group] almost never [expected action].",
      "The [adjective] part isn't what you think.",
      "You've felt [feeling]. Here's the machinery.",
      "[Number-free bold claim] — and it's measurable.",
    ],
    recommended_topics: Array.from({ length: 20 }, (_, i) =>
      `${winnerCats[0] ?? "psychology"} deep-cut #${i + 1}: mechanism behind a daily behavior`,
    ),
    caption_recommendations: [
      "Keep every line at 4-6 words; 7 is the ceiling, not the target",
      "Emphasize the noun carrying the tension, not adjectives",
    ],
    best_length_seconds: winLen,
    best_categories: winnerCats.length ? winnerCats : ["psychology"],
    best_tone: "calm, premium, mysterious",
    new_rules: [
      { category: "hook", rule: `Keep hooks under ${Math.max(8, Math.round(avgHookLen(winners)) + 2)} words; state a tension, never open with context.` },
      { category: "length", rule: `Target ${winLen}s total; winners cluster there.` },
      { category: "structure", rule: "Place an emotional reframe in the final third before the CTA." },
      ...(overpredicted.length
        ? [{
            category: "calibration",
            rule: `Your viral_potential ran hot on ${overpredicted.length} video(s): hooks that restate the topic without new tension must score <=6.`,
          }]
        : []),
    ],
  };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function lower(s: string): string { return s.charAt(0).toLowerCase() + s.slice(1); }
function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ").replace(/[,.;:]$/, "");
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
