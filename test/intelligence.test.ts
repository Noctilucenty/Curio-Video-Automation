import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { loadApprovedPatterns, validateTrendSnapshot } from "../src/intelligence.js";
import { packageSystemPrompt } from "../src/prompts.js";
import { createApp } from "../src/app.js";
import { InMemoryRepo } from "../src/repository.js";
import { MockLlmClient } from "../src/llm.js";
import { MockRenderer } from "../src/heygen.js";
import { MockVoice } from "../src/voice.js";
import { MockPostProcessor } from "../src/postprocess.js";
import type { Config } from "../src/config.js";

const GOOD_PATTERN = {
  id: "pat-eerie-footage",
  pattern: "eerie footage + specific-fact text",
  guidance: "Pair one unsettling visual premise with a single concrete fact (date, number, name) in the hook.",
  evidence: ["tiktok:7651816167732022550", "ig:DaC-b9uPF3v"],
  promotedAt: "2026-07-12",
};

describe("approved-pattern loading (evidence discipline is structural)", () => {
  it("loads valid patterns and drops entries without evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "intel-"));
    writeFileSync(join(dir, "approved-patterns.json"), JSON.stringify({
      patterns: [
        GOOD_PATTERN,
        { ...GOOD_PATTERN, id: "pat-no-evidence", evidence: [] },       // no evidence -> dropped
        { id: "pat-broken", pattern: "x" },                              // malformed -> dropped
      ],
    }));
    const patterns = loadApprovedPatterns(dir);
    expect(patterns.map((p) => p.id)).toEqual(["pat-eerie-footage"]);
  });

  it("returns [] for missing or corrupt files — trends can never break generation", () => {
    const dir = mkdtempSync(join(tmpdir(), "intel-"));
    expect(loadApprovedPatterns(dir)).toEqual([]);
    writeFileSync(join(dir, "approved-patterns.json"), "{not json");
    expect(loadApprovedPatterns(dir)).toEqual([]);
  });

  it("every committed approved pattern carries evidence and loads cleanly", () => {
    const committed = JSON.parse(
      readFileSync(join(__dirname, "..", "data", "viral-intelligence", "approved-patterns.json"), "utf8"),
    );
    expect(Array.isArray(committed.patterns)).toBe(true);
    for (const p of committed.patterns) {
      expect(p.evidence.length, `${p.id} must cite evidence`).toBeGreaterThan(0);
      expect(p.promotedAt).toBeTruthy();
    }
    // and the loader accepts the committed file as-is
    const loaded = loadApprovedPatterns(join(__dirname, "..", "data", "viral-intelligence"));
    expect(loaded.length).toBe(committed.patterns.length);
  });

  it("real committed trend snapshots validate against the schema rules", () => {
    for (const f of ["latest-youtube-trends.json", "ig-tiktok-outliers.json"]) {
      const snap = JSON.parse(
        readFileSync(join(__dirname, "..", "data", "viral-intelligence", f), "utf8"),
      );
      expect(validateTrendSnapshot(snap)).toEqual([]);
    }
  });
});

describe("trend snapshot validation", () => {
  const video = {
    videoId: "yt:abc", title: "t", url: "https://x", platform: "shorts", views: 100,
    hookType: "h", retentionMechanic: "r", curioAdaptation: "a", status: "candidate",
  };

  it("accepts a well-formed snapshot", () => {
    expect(validateTrendSnapshot({ collectedAt: "2026-07-12", source: "vidIQ", videos: [video] })).toEqual([]);
  });

  it("flags missing fields, bad enums, and duplicate video ids", () => {
    const issues = validateTrendSnapshot({
      collectedAt: "2026-07-12", source: "vidIQ",
      videos: [video, { ...video, platform: "facebook", status: "maybe", curioAdaptation: "" }],
    });
    expect(issues.join("; ")).toContain("bad platform");
    expect(issues.join("; ")).toContain("bad status");
    expect(issues.join("; ")).toContain("missing curioAdaptation");
    expect(issues.join("; ")).toContain("duplicate videoId");
  });
});

describe("pattern injection into the generation prompt", () => {
  it("approved patterns appear; the block is absent when none are approved", () => {
    const withPatterns = packageSystemPrompt([], [{ pattern: GOOD_PATTERN.pattern, guidance: GOOD_PATTERN.guidance }]);
    expect(withPatterns).toContain("Approved trend patterns");
    expect(withPatterns).toContain("eerie footage + specific-fact text");
    expect(packageSystemPrompt([])).not.toContain("Approved trend patterns");
  });
});

describe("manual rule promotion endpoint", () => {
  function testConfig(): Config {
    return {
      port: 0, adminToken: null, dataDir: "./data", cardsFrozen: false,
      adminPassword: null, sessionSecret: "test-secret-test-secret-test-secret-32",
      isProd: false, allowInsecureNoAuth: true, allowedOrigins: [],
      openai: { apiKey: null, model: "mock-llm" },
      heygen: { apiKey: null, avatarId: "av", voiceId: "vo" },
      elevenlabs: { apiKey: null, voiceId: "", modelId: "eleven_multilingual_v2" },
      captions: { apiKey: null, apiBase: undefined, captionTemplateId: undefined, supportsCustomCaptionTiming: false },
      renderer: "mock",
    };
  }

  it("creates a persistent manual rule that survives validation", async () => {
    const repo = new InMemoryRepo();
    const { app } = createApp({
      config: testConfig(), repo, llm: new MockLlmClient(), renderer: new MockRenderer(),
      voice: new MockVoice(), post: new MockPostProcessor(),
    });

    const res = await request(app).post("/api/learning/rules").send({
      category: "structure",
      rule: "Pair one unsettling visual premise with a single concrete fact in the hook.",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("manual");

    const active = await repo.listRules(true);
    expect(active.some((r) => r.id === res.body.id)).toBe(true);

    // rejected inputs
    expect((await request(app).post("/api/learning/rules").send({ category: "vibes", rule: "long enough rule" })).status).toBe(400);
    expect((await request(app).post("/api/learning/rules").send({ category: "hook", rule: "short" })).status).toBe(400);
  });
});
