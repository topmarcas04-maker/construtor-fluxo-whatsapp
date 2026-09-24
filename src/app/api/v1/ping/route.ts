export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/keys";
import { getAccount } from "@/lib/tenancy/server";
import { getEngineStatus } from "@/lib/services/whatsapp/engineClient";

/** GET /api/v1/ping — testa a chave e mostra se o WhatsApp está conectado */
export async function GET(req: NextRequest) {
  const a = await requireApiKey(req);
  if ("error" in a) return a.error;
  const [account, status] = await Promise.all([getAccount(a.accountId), getEngineStatus(a.accountId)]);
  return NextResponse.json({
    ok: true,
    account: account?.name || null,
    whatsapp: "error" in status ? "indisponível" : (status as { state?: string }).state || "desconhecido",
  });
}
