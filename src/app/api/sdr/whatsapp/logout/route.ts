export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { logoutWhatsapp } from "@/lib/services/whatsapp/engineClient";

/** Desconecta o WhatsApp da conta ativa (precisa ler o QR de novo para voltar) */
export async function POST() {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  await db.update(accounts).set({ waEnabled: false }).where(eq(accounts.id, auth.accountId));
  const res = await logoutWhatsapp(auth.accountId);
  if ("error" in res) return NextResponse.json(res, { status: 502 });
  return NextResponse.json({ ok: true });
}
