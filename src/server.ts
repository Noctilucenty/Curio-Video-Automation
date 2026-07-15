// Entry point: real config, JSON-file persistence, seed rules, listen.

// Load .env before anything reads process.env (native Node 21+, no dependency;
// silently skipped when no .env exists — e.g. fresh clones stay in mock mode).
try { process.loadEnvFile(); } catch { /* no .env — mock mode */ }

import { loadConfig } from "./config.js";
import { JsonFileRepo } from "./repository.js";
import { makeLlmClient } from "./llm.js";
import { HeyGenRenderer, MockRenderer, type Renderer } from "./heygen.js";
import { LocalRenderer } from "./localRenderer.js";
import { makeVoice } from "./voice.js";
import { makePostProcessor } from "./postprocess.js";
import { ensureSeedRules } from "./learning.js";
import { createApp } from "./app.js";

const config = loadConfig();
const repo = new JsonFileRepo(config.dataDir);
const llm = makeLlmClient(config.openai.apiKey, config.openai.model);
const renderer: Renderer =
  config.renderer === "heygen" && config.heygen.apiKey
    ? new HeyGenRenderer(config.heygen.apiKey)
    : config.renderer === "mock"
      ? new MockRenderer()
      : new LocalRenderer(config.dataDir);
const voice = makeVoice(config.elevenlabs.apiKey, {
  voiceId: config.elevenlabs.voiceId,
  modelId: config.elevenlabs.modelId,
});
const post = makePostProcessor(config.captions.apiKey, config.captions.apiBase, {
  captionTemplateId: config.captions.captionTemplateId,
  supportsCustomCaptionTiming: config.captions.supportsCustomCaptionTiming,
});

await ensureSeedRules(repo);

const { app } = createApp({ config, repo, llm, renderer, voice, post });

app.listen(config.port, () => {
  const mode = [
    config.openai.apiKey ? `openai:${config.openai.model}` : "openai:MOCK",
    config.elevenlabs.apiKey ? "elevenlabs:live" : "elevenlabs:MOCK",
    config.heygen.apiKey ? "heygen:live" : "heygen:MOCK",
    config.captions.apiKey ? "captions:live" : "captions:MOCK",
    config.adminToken ? "auth:on" : "auth:OPEN",
  ].join(" ");
  console.log(`[curio-automation] listening on http://localhost:${config.port} (${mode})`);
  console.log(`[curio-automation] review dashboard: http://localhost:${config.port}/`);
});
