export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { allowedSlots, setSlotLabel, slotFrom } from "@/lib/whatsapp/numbers";

/** Dá um nome a um WhatsApp da conta (ex.: "Vendas", "Pós-venda"). Corpo: { slot, label } */
export async function PATCH(req: Request) {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const slot = slotFrom(body?.slot);
  if (slot > (await allowedSlots(auth.accountId))) return NextResponse.json({ error: "Número não liberado para esta conta" }, { status: 403 });
  await setSlotLabel(auth.accountId, slot, typeof body?.label === "string" ? body.label : null);
  return NextResponse.json({ ok: true });
}
