// Headless learning run — same bootstrap as POST /api/learning/run, without
// needing the server up. Respects the 8GB-machine rule (single process).
// Run: npx tsx tools/run_learning.ts
try { process.loadEnvFile(); } catch { /* no .env — mock mode */ }

import { loadConfig } from "../src/config.js";
import { JsonFileRepo } from "../src/repository.js";
import { makeLlmClient } from "../src/llm.js";
import { runLearning } from "../src/learning.js";

const config = loadConfig();
const repo = new JsonFileRepo(config.dataDir);
const llm = makeLlmClient(config.openai.apiKey, config.openai.model);
const run = await runLearning(repo, llm);
// JsonFileRepo debounces writes 250ms on an unref'd timer — a short-lived
// process exits before it fires, silently dropping the run. Flush explicitly.
repo.flush();
console.log(JSON.stringify(run, null, 2));
