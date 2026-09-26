/**
 * Vários WhatsApps por conta (até 3). O 1 usa os campos wa* da conta; o 2 e o 3 ficam em wa_numbers.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, waNumbers } from "@/db/schema";
import { MAX_WHATSAPP_LIMIT } from "@/lib/plans/shared";

/** Quantos números a conta pode conectar */
export async function allowedSlots(accountId: string) {
  const a = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { maxWhatsapp: true, type: true } });
  if (a?.type === "MASTER") return MAX_WHATSAPP_LIMIT;
  return Math.max(1, Math.min(MAX_WHATSAPP_LIMIT, a?.maxWhatsapp || 1));
}

/** Lê o número pedido (1 a 3) do corpo da requisição */
export function slotFrom(v: unknown) {
  const n = Math.round(Number(v || 1));
  return Number.isFinite(n) && n >= 1 && n <= MAX_WHATSAPP_LIMIT ? n : 1;
}

/** Liga/desliga "manter conectado" de um número */
export async function setSlotEnabled(accountId: string, slot: number, enabled: boolean) {
  if (slot === 1) {
    await db.update(accounts).set({ waEnabled: enabled }).where(eq(accounts.id, accountId));
    return;
  }
  await db
    .insert(waNumbers)
    .values({ accountId, slot, enabled })
    .onConflictDoUpdate({ target: [waNumbers.accountId, waNumbers.slot], set: { enabled } });
}

/** Nomes dos números da conta: { 1: "Vendas", 2: "Pós-venda" } (vazio = "WhatsApp N") */
export async function slotLabels(accountId: string) {
  const a = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { waLabel: true } });
  const rows = await db.select({ slot: waNumbers.slot, label: waNumbers.label }).from(waNumbers).where(eq(waNumbers.accountId, accountId));
  const out: Record<number, string | null> = { 1: a?.waLabel || null };
  for (const r of rows) out[r.slot] = r.label || null;
  return out;
}

export async function setSlotLabel(accountId: string, slot: number, label: string | null) {
  const v = label?.trim().slice(0, 60) || null;
  if (slot === 1) {
    await db.update(accounts).set({ waLabel: v }).where(eq(accounts.id, accountId));
    return;
  }
  const found = await db.query.waNumbers.findFirst({ where: and(eq(waNumbers.accountId, accountId), eq(waNumbers.slot, slot)) });
  if (found) await db.update(waNumbers).set({ label: v }).where(eq(waNumbers.id, found.id));
  else await db.insert(waNumbers).values({ accountId, slot, label: v });
}
