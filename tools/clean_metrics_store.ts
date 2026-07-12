// One-off store hygiene for data/automation.json (local dev store):
//   1. Deletes importer-owned metric rows from the pre-content-hash scheme
//      (bare `met_posted_*` ids) — the importer re-creates correct ones.
//   2. Marks every remaining metric row without a provenance tag as
//      "synthetic": everything in the store before 2026-07-12 came from the
//      mock-render/dev era, and learning must never train on it. All live
//      ingestion paths tag provenance:"real" going forward.
//   3. Deactivates learning_run rules minted before the real-data import:
//      every learning run to date trained on those synthetic rows, so its
//      rules are contaminated. Future runs (post provenance filter) may
//      legitimately re-derive them from real posts.
// Safe to re-run. Run: npx tsx tools/clean_metrics_store.ts [dataDir]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.argv[2] ?? "./data";
const file = join(dataDir, "automation.json");
if (!existsSync(file)) {
  console.log(`${file} does not exist — nothing to clean`);
  process.exit(0);
}

const snap = JSON.parse(readFileSync(file, "utf8"));
const before = snap.metrics.length;

// 1. Drop legacy fixed-id importer rows (met_posted_<slug> with no hash tail);
//    content-hash rows look like met_posted_<slug>_<8 hex chars>.
snap.metrics = snap.metrics.filter((m: any) => {
  const legacyImporterRow = /^met_posted_[a-z0-9_]+$/.test(m.id) && !/_[0-9a-f]{8}$/.test(m.id);
  if (legacyImporterRow) console.log(`deleting stale importer row ${m.id} (videoId ${m.videoId})`);
  return !legacyImporterRow;
});

// 2. Everything still untagged is dev/mock-era → synthetic.
let marked = 0;
for (const m of snap.metrics) {
  if (m.provenance === undefined) {
    m.provenance = "synthetic";
    marked++;
  }
}

// 3. Learning-run rules minted from the synthetic era stay in the store for
//    the audit trail but must stop steering generation.
let deactivated = 0;
for (const r of snap.rules ?? []) {
  if (r.source === "learning_run" && r.active) {
    r.active = false;
    r.rule = `[DEACTIVATED 2026-07-12: derived from synthetic mock-era metrics — re-derive from real posts] ${r.rule}`;
    deactivated++;
  }
}

writeFileSync(file, JSON.stringify(snap, null, 2));
console.log(
  `done: ${before - snap.metrics.length} stale rows deleted, ${marked} untagged rows marked synthetic, ` +
    `${deactivated} synthetic-era learning rules deactivated, ` +
    `${snap.metrics.filter((m: any) => m.provenance === "real").length} real rows remain`,
);
