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
  purpose: "package" | "judge" | "learning";
}

export interface LlmClient {
  readonly model: string;
  generateJson(req: JsonRequest): Promise<unknown>;
}

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MAX_ATTEMPTS = 3;

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
          signal: AbortSignal.timeout(120_000),
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
        const body = (await res.json()) as { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
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
    return mockGenerate(req);
  }
}
