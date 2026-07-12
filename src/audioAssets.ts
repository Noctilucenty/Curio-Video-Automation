// Audio asset registry — replaces magic filenames (assets/bed.mp3, drone.mp3).
// Every audio file the renderer may mix is declared in assets/audio-assets.json
// with a role, a license note, and an approval flag. Only approved assets are
// auto-selected; unapproved entries are visible but inert until Leon confirms
// license + mood fit. Legacy magic paths still work as a fallback so existing
// setups don't silently lose their bed.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AudioRole = "bed" | "drone" | "tick" | "boom";

export interface AudioAsset {
  id: string;
  role: AudioRole;
  path: string;
  /** Provenance/licensing note. "UNVERIFIED" assets must stay approved:false. */
  license: string;
  mood: string;
  /** Only approved assets are ever auto-mixed into a render. */
  approved: boolean;
  notes?: string;
}

const REGISTRY_PATH = "assets/audio-assets.json";

const LEGACY_PATHS: Record<AudioRole, string[]> = {
  bed: ["assets/bed.mp3", "assets/bed.m4a", "assets/bed.wav"],
  drone: ["assets/drone.mp3", "assets/drone.m4a", "assets/drone.wav"],
  tick: ["assets/tick.mp3", "assets/tick.wav"],
  boom: ["assets/boom.mp3", "assets/boom.wav"],
};

/** Malformed registry entries are skipped; a broken file yields [] — audio
 * config must never be able to crash a render. */
export function loadAudioRegistry(registryPath: string = REGISTRY_PATH): AudioAsset[] {
  const file = resolve(registryPath);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(raw?.assets) ? raw.assets : [];
    return list.filter(
      (a: any): a is AudioAsset =>
        typeof a?.id === "string" &&
        ["bed", "drone", "tick", "boom"].includes(a?.role) &&
        typeof a?.path === "string" &&
        typeof a?.license === "string" &&
        typeof a?.approved === "boolean",
    );
  } catch {
    return [];
  }
}

/**
 * Pick the audio file for a role: first APPROVED registry asset whose file
 * exists, then the legacy magic paths. Returns null when nothing usable exists
 * (callers decide the fallback — the card renderer synthesizes a bed, because
 * silence is never acceptable).
 */
export function resolveAudioAsset(
  role: AudioRole,
  registryPath: string = REGISTRY_PATH,
): { path: string; source: "registry" | "legacy" } | null {
  for (const asset of loadAudioRegistry(registryPath)) {
    if (asset.role !== role || !asset.approved) continue;
    const p = resolve(asset.path);
    if (existsSync(p)) return { path: p, source: "registry" };
  }
  // Legacy magic filenames exist ONLY for pre-registry setups: the moment a
  // registry file is present it is the single source of truth, and no
  // unreviewed file — including one copied onto assets/bed.mp3 — can auto-mix.
  if (existsSync(resolve(registryPath))) return null;
  for (const candidate of LEGACY_PATHS[role]) {
    const p = resolve(candidate);
    if (existsSync(p)) return { path: p, source: "legacy" };
  }
  return null;
}
