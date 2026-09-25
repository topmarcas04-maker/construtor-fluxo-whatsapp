/**
 * Planos e serviços no servidor: benefícios da conta, validação dos planos e o suporte que a conta recebe.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accountServices, accounts } from "@/db/schema";
import { modulesAllowedForType, type AccountType } from "@/lib/auth/modules";
import { getAccount, getAccountModules, type AccountRow } from "@/lib/tenancy/server";
import { MASTER_BENEFITS, normalizeBenefits, type PlanBenefits } from "./shared";

export function childTypeOf(type: string): AccountType | null {
  if (type === "MASTER") return "PARTNER";
  if (type === "PARTNER") return "CLIENT";
  return null;
}

/** Benefícios efetivos da conta (o Master tem tudo) */
export function accountBenefits(a: Pick<AccountRow, "type" | "maxWhatsapp" | "callsPerMonth" | "supportAccess" | "premiumAccess">): PlanBenefits {
  if (a.type === "MASTER") return MASTER_BENEFITS;
  return {
    maxWhatsapp: a.maxWhatsapp ?? 1,
    callsPerMonth: a.callsPerMonth ?? 0,
    supportAccess: Boolean(a.supportAccess),
    premiumAccess: Boolean(a.premiumAccess),
  };
}

/** Menus e teto de benefícios que a conta pode colocar nos planos/contas que cadastra */
export async function grantContext(ownerId: string) {
  const owner = await getAccount(ownerId);
  if (!owner) return null;
  const childType = childTypeOf(owner.type);
  if (!childType) return null;
  const mine = await getAccountModules(owner);
  const grantable = (modulesAllowedForType(childType) as string[]).filter((m) => mine.includes(m as never));
  return { owner, childType, grantable, ceiling: accountBenefits(owner) };
}

/** Valida os campos de um plano vindos do formulário */
export function planValues(body: Record<string, unknown>, ctx: { grantable: string[]; ceiling: PlanBenefits }) {
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return { error: "Informe o nome do plano" } as const;
  const modules = Array.isArray(body.modules) ? body.modules.map(String).filter((m) => ctx.grantable.includes(m)) : [];
  return {
    values: {
      name,
      description: String(body.description ?? "").trim().slice(0, 1000) || null,
      price: String(body.price ?? "").trim().slice(0, 60) || null,
      modules,
      ...normalizeBenefits(body as never, ctx.ceiling),
      sort: Math.round(Number(body.sort)) || 0,
      active: body.active !== false,
    },
  } as const;
}

/** Suporte que a conta recebe: WhatsApp da conta que a cadastrou (se o plano dá direito) */
export async function supportFor(account: AccountRow) {
  if (account.type === "MASTER" || !account.supportAccess || !account.parentId) return null;
  const svc = await db.query.accountServices.findFirst({ where: eq(accountServices.accountId, account.parentId) });
  const phone = (svc?.supportPhone || "").replace(/\D/g, "");
  if (phone.length < 10) return null;
  const parent = await db.query.accounts.findFirst({ where: eq(accounts.id, account.parentId), columns: { name: true } });
  return { phone: phone.length <= 11 ? `55${phone}` : phone, hours: svc?.supportHours || null, provider: parent?.name || "" };
}
