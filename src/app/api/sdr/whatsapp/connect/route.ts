export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { connectWhatsapp } from "@/lib/services/whatsapp/engineClient";
import { allowedSlots, setSlotEnabled, slotFrom } from "@/lib/whatsapp/numbers";

/** Inicia a conexão (gera o QR Code) de um WhatsApp da conta ativa. Corpo: { slot: 1 | 2 | 3 } */
export async function POST(req: Request) {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const slot = slotFrom(body?.slot);
  const max = await allowedSlots(auth.accountId);
  if (slot > max) return NextResponse.json({ error: `Sua conta pode conectar até ${max} WhatsApp${max > 1 ? "s" : ""}` }, { status: 403 });
  await setSlotEnabled(auth.accountId, slot, true);
  const res = await connectWhatsapp(auth.accountId, slot);
  if ("error" in res) return NextResponse.json(res, { status: 502 });
  return NextResponse.json(res);
}
