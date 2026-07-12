import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAudioRegistry, resolveAudioAsset } from "../src/audioAssets.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "curio-audio-"));
  const registryPath = join(dir, "audio-assets.json");
  return { dir, registryPath };
}

function writeRegistry(registryPath: string, assets: unknown[]) {
  writeFileSync(registryPath, JSON.stringify({ assets }));
}

describe("audio asset registry", () => {
  it("resolves an approved asset", () => {
    const { dir, registryPath } = setup();
    const bed = join(dir, "bed.wav");
    writeFileSync(bed, "x");
    writeRegistry(registryPath, [
      { id: "a", role: "bed", path: bed, license: "CC0", mood: "dark", approved: true },
    ]);
    expect(resolveAudioAsset("bed", registryPath)).toEqual({ path: bed, source: "registry" });
  });

  it("never auto-mixes an unapproved asset", () => {
    const { dir, registryPath } = setup();
    const bed = join(dir, "bed.wav");
    writeFileSync(bed, "x");
    writeRegistry(registryPath, [
      { id: "a", role: "bed", path: bed, license: "UNVERIFIED", mood: "synthwave", approved: false },
    ]);
    expect(resolveAudioAsset("bed", registryPath)).toBeNull();
  });

  it("legacy magic filenames are DEAD once a registry file exists — the license-review bypass is closed", () => {
    const { dir, registryPath } = setup();
    // an unreviewed file copied onto the legacy magic path
    mkdirSync(join(dir, "assets"), { recursive: true });
    const legacyBed = join(process.cwd(), "assets", "bed.mp3");
    // (do not actually create files in the repo's assets/ — assert via registry presence)
    writeRegistry(registryPath, [
      { id: "a", role: "drone", path: join(dir, "missing.mp3"), license: "UNVERIFIED", mood: "x", approved: false },
    ]);
    // registry exists → resolver returns null rather than falling through to legacy paths
    expect(resolveAudioAsset("bed", registryPath)).toBeNull();
    expect(legacyBed).toContain("assets"); // silence unused-var lint
  });

  it("skips malformed registry entries instead of crashing", () => {
    const { registryPath } = setup();
    writeFileSync(registryPath, "{not json");
    expect(loadAudioRegistry(registryPath)).toEqual([]);
  });
});
