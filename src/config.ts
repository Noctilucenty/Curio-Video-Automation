// Env-driven config. Missing provider keys flip the matching client into mock
// mode instead of crashing, so the whole pipeline runs offline (dev + tests).

export interface Config {
  port: number;
  adminToken: string | null;
  dataDir: string;
  /** "local" = no-avatar dark-editorial renderer (default); "heygen" = avatar. */
  renderer: "local" | "heygen" | "mock";
  openai: { apiKey: string | null; model: string };
  /** Static cards are FROZEN (Leon 2026-07-12): no generation spend on them
   * until he unfreezes. The renderer/tests keep working; the public API refuses
   * new card topics/drafts. Set CARDS_FROZEN=0 to unfreeze deliberately. */
  cardsFrozen: boolean;
  heygen: { apiKey: string | null; avatarId: string; voiceId: string };
  elevenlabs: { apiKey: string | null; voiceId: string; modelId: string };
  captions: { apiKey: string | null; apiBase: string | undefined };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const renderer = env.RENDERER?.trim().toLowerCase();
  return {
    port: Number(env.PORT) || 8790,
    adminToken: env.ADMIN_TOKEN?.trim() || null,
    dataDir: env.DATA_DIR?.trim() || "./data",
    renderer: renderer === "heygen" || renderer === "mock" ? renderer : "local",
    cardsFrozen: env.CARDS_FROZEN?.trim() !== "0",
    openai: {
      apiKey: env.OPENAI_API_KEY?.trim() || null,
      // Leon's rule (updated 2026-07-12): the video factory uses the newest
      // full-strength GPT model — best quality over cost, never mini/nano for
      // content decisions. "gpt-5.6" is OpenAI's latest alias (routes to the
      // flagship gpt-5.6-sol); the EXACT model each response used is recorded
      // per generation. Pin a snapshot id via OPENAI_MODEL during controlled
      // A/B cohorts so silent model updates can't contaminate an experiment.
      model: env.OPENAI_MODEL?.trim() || "gpt-5.6",
    },
    heygen: {
      apiKey: env.HEYGEN_API_KEY?.trim() || null,
      avatarId: env.HEYGEN_AVATAR_ID?.trim() || "",
      voiceId: env.HEYGEN_VOICE_ID?.trim() || "",
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY?.trim() || null,
      // The Zack D Films-style narration voice cloned/selected in the account.
      voiceId: env.ELEVENLABS_VOICE_ID?.trim() || "",
      modelId: env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2",
    },
    captions: {
      apiKey: env.CAPTIONS_API_KEY?.trim() || null,
      apiBase: env.CAPTIONS_API_BASE?.trim() || undefined,
    },
  };
}

let counter = 0;

/** Sortable unique id: <prefix>_<time36>_<seq><rand>. */
export function makeId(prefix: string): string {
  counter = (counter + 1) % 1296;
  const seq = counter.toString(36).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${seq}${rand}`;
}
