export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { resolveAccountVoiceKey } from "@/lib/tenancy/server";
import { listVoices, testOpenAiKey } from "@/lib/voice/providers";

/** POST { provider: "openai" | "eleven" } — confere se a chave funciona */
export async function POST(req: Request) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const provider = body.provider === "eleven" ? "eleven" : "openai";
  const key = await resolveAccountVoiceKey(auth.accountId, provider);
  if (!key.apiKey) return NextResponse.json({ ok: false, error: "Nenhuma chave cadastrada." }, { status: 400 });
  try {
    if (provider === "openai") await testOpenAiKey(key.apiKey);
    else await listVoices(key.apiKey);
    return NextResponse.json({ ok: true, providerName: key.providerAccountName });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
