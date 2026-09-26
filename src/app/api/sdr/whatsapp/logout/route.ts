export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { logoutWhatsapp } from "@/lib/services/whatsapp/engineClient";
import { setSlotEnabled, slotFrom } from "@/lib/whatsapp/numbers";

/** Desconecta um WhatsApp da conta ativa (precisa ler o QR de novo para voltar). Corpo: { slot } */
export async function POST(req: Request) {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const slot = slotFrom(body?.slot);
  await setSlotEnabled(auth.accountId, slot, false);
  const res = await logoutWhatsapp(auth.accountId, slot);
  if ("error" in res) return NextResponse.json(res, { status: 502 });
  return NextResponse.json({ ok: true });
}
