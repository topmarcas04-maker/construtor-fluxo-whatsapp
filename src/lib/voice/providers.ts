/**
 * Áudio: transcrever (OpenAI) e falar (ElevenLabs). Sem imports "@/": usado também pelo motor.
 * As URLs podem ser trocadas por variáveis (OPENAI_BASE_URL / ELEVENLABS_BASE_URL) para testes.
 */

const openaiBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
const elevenBase = () => (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function errorText(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.detail?.message || j?.detail || raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200) || `HTTP ${res.status}`;
  }
}

/** Áudio → texto (português) */
export async function transcribeAudio(audio: Buffer, mime: string, apiKey: string): Promise<string> {
  const ext = /ogg|opus/.test(mime) ? "ogg" : /mpeg|mp3/.test(mime) ? "mp3" : /mp4|m4a|aac/.test(mime) ? "m4a" : /webm/.test(mime) ? "webm" : /wav/.test(mime) ? "wav" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] || "audio/ogg" }), `audio.${ext}`);
  form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  form.append("language", "pt");
  return withTimeout(45_000, async (signal) => {
    const res = await fetch(`${openaiBase()}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
    if (!res.ok) throw new Error(`OpenAI: ${await errorText(res)}`);
    const data = (await res.json()) as { text?: string };
    return (data.text || "").trim();
  });
}

/** Confere se a chave da OpenAI funciona */
export async function testOpenAiKey(apiKey: string) {
  return withTimeout(15_000, async (signal) => {
    const res = await fetch(`${openaiBase()}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (!res.ok) throw new Error(`OpenAI: ${await errorText(res)}`);
    return true;
  });
}

export interface ElevenVoice {
  id: string;
  name: string;
  description: string;
  previewUrl: string | null;
}

/** Vozes disponíveis na conta ElevenLabs */
export async function listVoices(apiKey: string): Promise<ElevenVoice[]> {
  return withTimeout(20_000, async (signal) => {
    const res = await fetch(`${elevenBase()}/v1/voices`, { headers: { "xi-api-key": apiKey }, signal });
    if (!res.ok) throw new Error(`ElevenLabs: ${await errorText(res)}`);
    const data = (await res.json()) as {
      voices?: { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string }[];
    };
    return (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: Object.values(v.labels || {}).filter(Boolean).join(" · "),
      previewUrl: v.preview_url || null,
    }));
  });
}

/** Tira emojis e marcações que a voz leria de forma estranha */
export function textForSpeech(text: string) {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 900);
}

/** Texto → áudio (mp3) com a voz escolhida */
export async function synthesizeSpeech(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  return withTimeout(60_000, async (signal) => {
    const res = await fetch(
      `${elevenBase()}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: textForSpeech(text),
          model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        }),
        signal,
      }
    );
    if (!res.ok) throw new Error(`ElevenLabs: ${await errorText(res)}`);
    return Buffer.from(await res.arrayBuffer());
  });
}
