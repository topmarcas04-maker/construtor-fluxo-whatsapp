export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getEngineStatus } from "@/lib/services/whatsapp/engineClient";

/**
 * GET /api/sdr/whatsapp/status
 * Status da conexão do WhatsApp (proxy pro motor de fluxo, que é quem
 * mantém a sessão Baileys viva).
 */
export async function GET() {
  const status = await getEngineStatus();
  return NextResponse.json(status);
}
