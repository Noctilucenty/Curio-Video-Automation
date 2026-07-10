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
    case "package": return mockPackage(req.user);
    case "judge": return mockJudge(req.user);
    case "learning": return mockLearning(req.user);
  }
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
    post_caption: `${hook} Some things are too interesting to scroll past. Real rabbit holes live in Curio.`,
    hashtags: ["#psychology", "#rabbithole", "#strangefacts", "#curio"],
    cta: "Real rabbit holes live in Curio.",
    estimated_length_seconds: length,
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

  return {
    hook_score: hookScore,
    retention_score: retention,
    clarity_score: clarity,
    caption_readability: captionReadability,
    brand_fit: brandFit,
    viral_potential: viral,
    factual_safety: factualSafety,
    overall_score: overall,
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
  const winners: any[] = payload.top_videos ?? [];
  const losers: any[] = payload.bottom_videos ?? [];

  const avgHookLen = (vs: any[]) =>
    vs.length ? vs.reduce((s, v) => s + String(v.hook ?? "").split(/\s+/).length, 0) / vs.length : 0;
  const winnerCats = [...new Set(winners.map((v) => v.category).filter(Boolean))] as string[];
  const winLen = winners.length
    ? Math.round(winners.reduce((s, v) => s + (v.length_seconds ?? 28), 0) / winners.length)
    : 28;

  return {
    top_patterns: [
      `Winning hooks average ${Math.round(avgHookLen(winners))} words and state a tension, not a question`,
      `Winning categories: ${winnerCats.join(", ") || "psychology"}`,
      "Winners place an emotional reframe in the final third",
    ],
    weak_patterns: [
      `Losing hooks average ${Math.round(avgHookLen(losers))} words or open with context instead of tension`,
      "Losers explain past the 18s mark without a second curiosity turn",
    ],
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
    ],
  };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function lower(s: string): string { return s.charAt(0).toLowerCase() + s.slice(1); }
function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ").replace(/[,.;:]$/, "");
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
