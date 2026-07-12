// Seed the CONFIRMED lessons from Curio's own four posted videos (2026-07-12
// analysis — ledger EXP-202606-30-01…EXP-202607-06-06) into the rules DB as
// manual rules, so they steer generation IMMEDIATELY and persist across
// learning-run supersession. Idempotent: fixed ids, updated in place.
// Run: npx tsx tools/seed_confirmed_rules.ts [dataDir]

import { JsonFileRepo } from "../src/repository.js";
import type { LearningRule } from "../src/types.js";

const dataDir = process.argv[2] ?? "./data";

const RULES: Array<Pick<LearningRule, "id" | "category" | "rule">> = [
  {
    id: "rule_posted_anomaly_first",
    category: "hook",
    rule: "Show the physical anomaly ON SCREEN at t=0 and put survival/danger stakes in the first sentence; the full premise must be understandable by second 2 — never a sentence fragment that resolves later. (Evidence: Third Man 38.6% skip with footprints at t=0 vs Boat v1 59.1% with a fragment hook.)",
  },
  {
    id: "rule_posted_named_reveal_residual_mystery",
    category: "structure",
    rule: "Name the phenomenon at ~70-80% of runtime and leave residual mystery after the reveal — the explanation must satisfy without fully closing the question. (Evidence: Third Man kept the supernatural reading alive; only video with nonzero shares/saves/reposts/comments.)",
  },
  {
    id: "rule_posted_human_presence",
    category: "structure",
    rule: "Include a human presence in the visuals (even a distant silhouette) and change the composition with each evidence beat; never open on generic symbolic imagery like glowing brains or bare gradients. (Evidence: Can't Forget 67.7% skip on a brain silhouette; Boat retry 73.4% holding one composition.)",
  },
  {
    id: "rule_posted_never_lengthen_weak",
    category: "length",
    rule: "Target 15-20 seconds. Never rescue a weak concept by making it longer or more explicit — recut the first 3 seconds instead. (Evidence: Boat retry 23.5s→28s made every metric worse: skip 59.1%→73.4%, likes 6.3%→0.9%.)",
  },
  {
    id: "rule_posted_calibration_likes_not_retention",
    category: "calibration",
    rule: "Do not let aesthetic quality inflate retention_score: beautiful slow-premise videos earn likes while losing half the audience in seconds (Boat v1: like 6.3%, watch ratio 25.5%). Score retention from premise speed and beat-by-beat necessity, not polish.",
  },
];

async function main() {
  const repo = new JsonFileRepo(dataDir);
  for (const r of RULES) {
    const existing = (await repo.listRules()).find((x) => x.id === r.id);
    const rule: LearningRule = {
      ...r,
      source: "manual",
      active: true,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await (existing ? repo.updateRule(rule) : repo.addRule(rule));
    console.log(`${existing ? "updated" : "added"} ${r.id} [${r.category}]`);
  }
  repo.flush();
  console.log("done — rules are live in every future generation prompt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
