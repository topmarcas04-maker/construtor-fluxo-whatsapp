export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getEngineStatus } from "@/lib/services/whatsapp/engineClient";
import { resolveAccountAiKey } from "@/lib/tenancy/server";

/** Status do WhatsApp da conta ativa + se a IA tem chave disponível */
export async function GET() {
  const auth = await requireUser(["whatsapp", "configuracoes", "leads"]);
  if (auth.error) return auth.error;
  const [status, ai] = await Promise.all([getEngineStatus(auth.accountId), resolveAccountAiKey(auth.accountId)]);
  return NextResponse.json({ ...status, aiReady: Boolean(ai.apiKey), aiReason: ai.reason });
}
