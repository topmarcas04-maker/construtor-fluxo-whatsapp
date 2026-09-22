export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { getEngineStatus } from "@/lib/services/whatsapp/engineClient";

/**
 * GET /api/sdr/whatsapp/status
 * Status da conexão do WhatsApp (proxy pro motor de fluxo, que é quem
 * mantém a sessão Baileys viva).
 */
export async function GET() {
  const auth = await requireUser(["whatsapp", "configuracoes", "leads"]);
  if (auth.error) return auth.error;
  const status = await getEngineStatus();
  return NextResponse.json(status);
}
