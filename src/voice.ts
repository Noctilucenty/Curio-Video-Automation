// ElevenLabs voice synthesis. The narration voice is an ElevenLabs voice
// (short-form documentary narrator — id via env), NOT HeyGen's built-in TTS:
// HeyGen only lip-syncs to the audio we hand it.
// Missing key => MockVoice so the pipeline still completes offline.

/**
 * Voice-design brief for creating/selecting the ELEVENLABS_VOICE_ID in the
 * ElevenLabs dashboard (Voice Design / library pick). The API settings below
 * control delivery; the voice itself must match this description:
 */
export const VOICE_DIRECTION = `Young male short-form documentary narrator with a deep, clear,
slightly compressed voice. Speaks fast and confidently, every word sharply
articulated. Immediate urgency at sentence starts, intensity builds as the
mystery develops. Short pauses before twists, lower pitch on disturbing
details, final reveal lands slower and heavier. Curious, serious, slightly
unsettling, highly engaging — not theatrical, cheerful, or overly emotional.
Modern viral explainer rhythm: controlled breath, crisp consonants, strong
emphasis on key words. Not a copy of any identifiable creator's exact voice.`;

// Delivery settings per the launch spec: stability 40-50, similarity 65-75,
// style exaggeration 15-25, speaker boost on, speed 1.05-1.12x.
export const VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.7,
  style: 0.2,
  use_speaker_boost: true,
  speed: 1.08,
} as const;

export interface SynthesisResult {
  audio: Uint8Array;
  mimeType: string;
  voiceId: string;
}

export interface VoiceSynth {
  readonly provider: "elevenlabs" | "mock";
  synthesize(script: string): Promise<SynthesisResult>;
}

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_ATTEMPTS = 3;

export interface ElevenLabsOptions {
  voiceId: string;
  modelId?: string;
}

export class ElevenLabsVoice implements VoiceSynth {
  readonly provider = "elevenlabs" as const;
  private voiceId: string;
  private modelId: string;

  constructor(private apiKey: string, opts: ElevenLabsOptions) {
    this.voiceId = opts.voiceId;
    this.modelId = opts.modelId ?? "eleven_v3";
  }

  async synthesize(script: string): Promise<SynthesisResult> {
    if (!this.voiceId) throw new Error("elevenlabs: ELEVENLABS_VOICE_ID is not set");
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${TTS_URL}/${encodeURIComponent(this.voiceId)}`, {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: script,
            model_id: this.modelId,
            voice_settings: VOICE_SETTINGS,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`elevenlabs ${res.status}`);
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength === 0) throw new Error("elevenlabs returned empty audio");
        return { audio: buf, mimeType: "audio/mpeg", voiceId: this.voiceId };
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(500 * attempt * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

/** Deterministic fake audio for dev/tests. */
export class MockVoice implements VoiceSynth {
  readonly provider = "mock" as const;
  async synthesize(script: string): Promise<SynthesisResult> {
    return {
      audio: new TextEncoder().encode(`MOCK_AUDIO(len=${script.length})`),
      mimeType: "audio/mpeg",
      voiceId: "mock-voice",
    };
  }
}

export function makeVoice(apiKey: string | null, opts: ElevenLabsOptions): VoiceSynth {
  return apiKey ? new ElevenLabsVoice(apiKey, opts) : new MockVoice();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
