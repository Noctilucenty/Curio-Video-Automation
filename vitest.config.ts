import { defineConfig } from "vitest/config";

// This repo is developed on an 8GB Mac that also runs renders and other dev
// servers. Vitest's default threaded worker pool spawns a worker per core and
// gets the whole run SIGKILLed under memory pressure (observed 2026-07-14:
// repeated exit 137 mid-suite). One forked worker, files run sequentially —
// slower on paper, but it FINISHES, and the suite is offline/mock so per-file
// cost is tiny.
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
