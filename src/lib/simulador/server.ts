import { asc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { cardMachines } from "@/db/schema";
import { getAccount } from "@/lib/tenancy/server";
import type { CardMachine } from "./common";

/** Maquininhas da conta + as das contas acima (Parceiro e Master), que aparecem como tabela padrão */
export async function listMachines(accountId: string): Promise<CardMachine[]> {
  const chain: { id: string; name: string }[] = [];
  let acc = await getAccount(accountId);
  for (let i = 0; acc && i < 8; i++) {
    chain.push({ id: acc.id, name: acc.name });
    acc = await getAccount(acc.parentId);
  }
  if (!chain.length) return [];
  const rows = await db
    .select()
    .from(cardMachines)
    .where(inArray(cardMachines.accountId, chain.map((c) => c.id)))
    .orderBy(asc(cardMachines.sort), asc(cardMachines.createdAt));
  const level = (id: string) => chain.findIndex((c) => c.id === id);
  return rows
    .sort((a, b) => level(a.accountId) - level(b.accountId))
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      debitRate: r.debitRate,
      rates: (r.rates || []) as (number | null)[],
      ownerName: chain[level(r.accountId)]?.name || "",
      own: r.accountId === accountId,
    }));
}

/** Imposto da conta: Master e Parceiro usam o próprio; Cliente usa o do Parceiro (ou de quem estiver acima) */
export async function effectiveTax(accountId: string) {
  let acc = await getAccount(accountId);
  let fromParent = false;
  for (let i = 0; acc && i < 8; i++) {
    if (acc.type !== "CLIENT") return { taxRate: acc.simTaxRate ?? 0, source: fromParent ? acc.name : null };
    acc = await getAccount(acc.parentId);
    fromParent = true;
  }
  return { taxRate: 0, source: null };
}
