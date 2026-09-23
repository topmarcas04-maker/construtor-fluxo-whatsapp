export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { resolveAccountVoiceKey } from "@/lib/tenancy/server";
import { listVoices, synthesizeSpeech } from "@/lib/voice/providers";

/** GET — vozes da ElevenLabs disponíveis para a conta */
export async function GET() {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const key = await resolveAccountVoiceKey(auth.accountId, "eleven");
  if (!key.apiKey) return NextResponse.json({ error: "Cadastre a chave da ElevenLabs primeiro." }, { status: 400 });
  try {
    return NextResponse.json(await listVoices(key.apiKey));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** POST { voiceId, text? } — amostra da voz (mp3) para ouvir antes de escolher */
export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const voiceId = String(body.voiceId || "");
  if (!voiceId) return NextResponse.json({ error: "Escolha uma voz" }, { status: 400 });
  const key = await resolveAccountVoiceKey(auth.accountId, "eleven");
  if (!key.apiKey) return NextResponse.json({ error: "Cadastre a chave da ElevenLabs primeiro." }, { status: 400 });
  const text =
    String(body.text || "").trim().slice(0, 300) ||
    "Oi! Tudo bem? Aqui é da loja. Vi que você se interessou pela nossa scooter elétrica. Quer que eu te mande as fotos e os valores?";
  try {
    const mp3 = await synthesizeSpeech(text, voiceId, key.apiKey);
    return new NextResponse(new Uint8Array(mp3), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
