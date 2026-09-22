export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { connectWhatsapp } from "@/lib/services/whatsapp/engineClient";

/** Inicia a conexão (gera o QR Code) do WhatsApp da conta ativa */
export async function POST() {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  await db.update(accounts).set({ waEnabled: true }).where(eq(accounts.id, auth.accountId));
  const res = await connectWhatsapp(auth.accountId);
  if ("error" in res) return NextResponse.json(res, { status: 502 });
  return NextResponse.json(res);
}
