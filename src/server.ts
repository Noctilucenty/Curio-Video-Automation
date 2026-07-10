// Entry point: real config, JSON-file persistence, seed rules, listen.

import { loadConfig } from "./config.js";
import { JsonFileRepo } from "./repository.js";
import { makeLlmClient } from "./llm.js";
import { makeRenderer } from "./heygen.js";
import { ensureSeedRules } from "./learning.js";
import { createApp } from "./app.js";

const config = loadConfig();
const repo = new JsonFileRepo(config.dataDir);
const llm = makeLlmClient(config.openai.apiKey, config.openai.model);
const renderer = makeRenderer(config.heygen.apiKey);

await ensureSeedRules(repo);

const { app } = createApp({ config, repo, llm, renderer });

app.listen(config.port, () => {
  const mode = [
    config.openai.apiKey ? `openai:${config.openai.model}` : "openai:MOCK",
    config.heygen.apiKey ? "heygen:live" : "heygen:MOCK",
    config.adminToken ? "auth:on" : "auth:OPEN",
  ].join(" ");
  console.log(`[curio-automation] listening on http://localhost:${config.port} (${mode})`);
  console.log(`[curio-automation] review dashboard: http://localhost:${config.port}/`);
});
