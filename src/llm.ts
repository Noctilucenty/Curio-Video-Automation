// LLM abstraction. Pipeline code only sees LlmClient.generateJson(); the real
// adapter calls OpenAI's Responses API with a strict JSON schema, the mock
// adapter produces deterministic Curio-style output so dev/tests run offline.
// Tests can also inject their own stub to force failure/retry paths.

export interface JsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Judge/learning calls want stricter, lower-temperature behavior. */
  purpose: "package" | "judge" | "factcheck" | "learning" | "ingest";
  /** Optional per-request response window for larger strict schemas. The
   * default stays 120s; callers may extend it without weakening the model or
   * reasoning setting. */
  timeoutMs?: number;
  /** Called with the EXACT model id the API response reports (snapshot, not
   * the request alias) so generation records can pin what actually ran. */
  onModel?: (model: string) => void;
}

export interface LlmClient {
  readonly model: string;
  generateJson(req: JsonRequest): Promise<unknown>;
}

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MAX_ATTEMPTS = 3;

/**
 * Reasoning-effort routing (Codex review policy, 2026-07-12): strongest model
 * everywhere quality matters, but do NOT overpower it — deterministic checks
 * stay in code, and reasoning depth is matched to the task. "max" is reserved
 * for exceptional manual investigations, never the production loop.
 */
export const PURPOSE_REASONING: Record<JsonRequest["purpose"], "low" | "medium" | "high" | "xhigh"> = {
  package: "high",   // hook/script/visual-direction generation
  judge: "high",     // independent creative judging
  factcheck: "xhigh", // factuality + source review — the strictest pass
  learning: "high",  // analytics synthesis + rule proposals
  ingest: "low",     // messy-text parsing; structure does the work
};

export class OpenAiClient implements LlmClient {
  constructor(private apiKey: string, public readonly model: string) {}

  async generateJson(req: JsonRequest): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            reasoning: { effort: PURPOSE_REASONING[req.purpose] },
            input: [
              { role: "system", content: [{ type: "input_text", text: req.system }] },
              { role: "user", content: [{ type: "input_text", text: req.user }] },
            ],
            text: {
              format: {
                type: "json_schema",
                name: req.schemaName,
                schema: req.schema,
                strict: true,
              },
            },
          }),
          signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
        });
        if (res.status === 429 || res.status >= 500) {
          // transient — retry with backoff
          lastErr = new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) {
          throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 500)}`);
        }
        const body = (await res.json()) as { model?: string; output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
        if (body.model) req.onModel?.(body.model);
        const text = extractOutputText(body);
        if (!text) throw new Error("openai response had no output_text");
        return JSON.parse(text);
      } catch (e) {
        lastErr = e;
        if (!isTransient(e) || attempt === MAX_ATTEMPTS) throw e instanceof Error ? e : new Error(String(e));
        await sleep(500 * attempt * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

function extractOutputText(body: { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }): string | null {
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) return c.text;
    }
  }
  return null;
}

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|5\d\d|timeout|abort|network|fetch failed/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function makeLlmClient(apiKey: string | null, model: string): LlmClient {
  if (apiKey) return new OpenAiClient(apiKey, model);
  // Lazy import avoids a cycle (mock builds packages using prompt constants).
  return new MockLlmClient();
}

// ---------------------------------------------------------------------------
// Mock adapter — deterministic per input, shaped like real output. The mock
// judge actually applies the rubric heuristically (banned phrases, caption
// length, hook length) so the regeneration loop is exercised for real offline.
// ---------------------------------------------------------------------------

import { mockGenerate } from "./mockLlm.js";

export class MockLlmClient implements LlmClient {
  readonly model = "mock-llm";
  async generateJson(req: JsonRequest): Promise<unknown> {
    req.onModel?.(this.model);
    return mockGenerate(req);
  }
}
