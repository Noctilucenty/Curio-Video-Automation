// Seed the lessons from Curio's own four posted videos (2026-07-12 analysis —
// ledger EXP-202606-30-01…EXP-202607-06-06) into the rules DB as manual rules.
//
// EVERY rule is explicitly PROVISIONAL (Codex review 2026-07-12): the dataset
// is one winner + several confounded comparisons, so these are hypotheses the
// generator should test, not laws. Each rule text carries its promotion
// condition — the three NEXT_EXPERIMENTS replications decide promotion to
// confirmed wording or deletion. Manual rules persist across learning-run
// supersession, which is exactly why they must not overstate their evidence.
//
// Idempotent: fixed ids, updated in place. Run: npx tsx tools/seed_provisional_rules.ts [dataDir]

import { JsonFileRepo } from "../src/repository.js";
import type { LearningRule } from "../src/types.js";

const dataDir = process.argv[2] ?? "./data";

const PREFIX =
  "[PROVISIONAL n=4, single winner — treat as hypothesis; promote/drop after the NEXT_EXPERIMENTS replications] ";

const RULES: Array<Pick<LearningRule, "id" | "category" | "rule">> = [
  {
    id: "rule_posted_anomaly_first",
    category: "hook",
    rule: `${PREFIX}Show a physical anomaly ON SCREEN at t=0 and put survival/danger stakes in the first sentence; make the full premise understandable by second 2 — avoid sentence-fragment hooks that resolve later. (Evidence: Third Man 38.6% skip with footprints at t=0 vs Boat v1 59.1% with a fragment hook — confounded with topic.)`,
  },
  {
    id: "rule_posted_named_reveal_residual_mystery",
    category: "structure",
    rule: `${PREFIX}Prefer naming the phenomenon around ~70-80% of runtime and leaving residual mystery after the reveal. (Evidence: one winner did this; the timing number describes that single video, not an established optimum.)`,
  },
  {
    id: "rule_posted_human_presence",
    category: "structure",
    rule: `${PREFIX}Prefer a human presence in the visuals and change composition with evidence beats; avoid opening on generic symbolic imagery (glowing brains, bare gradients). (Evidence: Can't Forget 67.7% skip on a brain-silhouette opening; Boat retry 73.4% holding one composition — both confounded with other variables.)`,
  },
  {
    id: "rule_posted_never_lengthen_weak",
    category: "length",
    rule: `${PREFIX}Do not rescue a weak concept by making it longer or more explicit — recut the first 3 seconds instead. Target range stays the playbook's 12-16s default; the winner ran 20.17s, so 15-20s is a hypothesis to test, not a rule. (Evidence: Boat retry 23.5s→28s made every metric worse — but five variables changed at once.)`,
  },
  {
    id: "rule_posted_calibration_likes_not_retention",
    category: "calibration",
    rule: `Do not let aesthetic quality inflate retention_score: a beautiful slow-premise video earned likes while losing half its audience in seconds (Boat v1: like 6.3%, watch ratio 25.5%). Score retention from premise speed and beat-by-beat necessity, not polish. (Best-supported lesson in the set — directly observed on two independent posts.)`,
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
  console.log("done — provisional rules live in the generation prompt; promotion gate documented in each");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
