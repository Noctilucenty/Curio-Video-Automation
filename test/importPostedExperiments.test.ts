import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Real-script integration test: the importer's update semantics are exactly
// what keeps the "ground truth" dataset authoritative, so we exercise the
// actual tool, not a re-implementation.

function dataset(views: number) {
  return JSON.stringify({
    collectedAt: "2026-07-12",
    experiments: [
      {
        id: "test-reversal",
        title: "Reversal Test",
        category: "test-category",
        postedAt: "2026-06-30",
        sourceFile: "samples/test.mp4",
        verdict: "test",
        creative: {
          archetype: "test archetype",
          durationSeconds: 20,
          openingFrame: "test frame",
          hookWording: "Test hook wording here",
          visualTimeline: "a → b",
          reveal: "the reveal",
          cta: "",
          audio: { style: "ambient", integratedLufs: -17 },
        },
        analytics: {
          viewsInstagram: views,
          reachInstagram: 100,
          avgWatchTimeSeconds: 10,
          retentionAtEnd: 0.2,
          skipRate: 0.4,
          likeRate: 0.05,
          commentRate: 0,
          shareRate: 0.01,
          saveRate: 0.01,
        },
      },
    ],
  });
}

function runImport(dataDir: string, datasetPath: string): void {
  // vitest runs from the repo root, where the tool and tsx live.
  execFileSync("npx", ["tsx", "tools/import_posted_experiments.ts", dataDir, datasetPath], {
    stdio: "pipe",
  });
}

function latestRealRow(dataDir: string): { views: number; ingestedAt: number } {
  const snap = JSON.parse(readFileSync(join(dataDir, "automation.json"), "utf8"));
  const rows = snap.metrics
    .filter((m: { provenance?: string }) => m.provenance === "real")
    .sort((a: { ingestedAt: number }, b: { ingestedAt: number }) => b.ingestedAt - a.ingestedAt);
  return rows[0];
}

describe("import_posted_experiments update semantics", () => {
  it("A→B→A: reverting a correction re-selects the original row as latest", () => {
    const dir = mkdtempSync(join(tmpdir(), "curio-import-"));
    const datasetPath = join(dir, "dataset.json");

    writeFileSync(datasetPath, dataset(196)); // A
    runImport(dir, datasetPath);
    writeFileSync(datasetPath, dataset(240)); // correction B
    runImport(dir, datasetPath);
    expect(latestRealRow(dir).views).toBe(240);

    writeFileSync(datasetPath, dataset(196)); // revert to A
    runImport(dir, datasetPath);
    // Before the ingestedAt refresh, the pre-existing A row was skipped and
    // B stayed latest — the exact reversal edge case from the review.
    expect(latestRealRow(dir).views).toBe(196);

    const snap = JSON.parse(readFileSync(join(dir, "automation.json"), "utf8"));
    const real = snap.metrics.filter((m: { provenance?: string }) => m.provenance === "real");
    expect(real).toHaveLength(2); // A and B — the revert touched A, added nothing
  });
}, 120_000);
