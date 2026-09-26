export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getEngineStatus } from "@/lib/services/whatsapp/engineClient";
import { resolveAccountAiKey } from "@/lib/tenancy/server";
import { allowedSlots, slotLabels } from "@/lib/whatsapp/numbers";

/**
 * Status dos WhatsApps da conta ativa + se a IA tem chave disponível.
 * Os campos de fora são do WhatsApp 1 (compatível com as telas antigas); "numbers" traz todos.
 */
export async function GET() {
  const auth = await requireUser(["whatsapp", "configuracoes", "leads"]);
  if (auth.error) return auth.error;
  const max = await allowedSlots(auth.accountId);
  const slots = Array.from({ length: max }, (_, i) => i + 1);
  const [statuses, ai, labels] = await Promise.all([
    Promise.all(slots.map((n) => getEngineStatus(auth.accountId, n))),
    resolveAccountAiKey(auth.accountId),
    slotLabels(auth.accountId),
  ]);
  const numbers = slots.map((slot, i) => ({ slot, label: labels[slot] || null, ...statuses[i] }));
  return NextResponse.json({ ...statuses[0], numbers, maxWhatsapp: max, aiReady: Boolean(ai.apiKey), aiReason: ai.reason });
}
