export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, plans } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { grantContext, planValues } from "@/lib/plans/server";

async function ownPlan(accountId: string, id: string) {
  return db.query.plans.findFirst({ where: and(eq(plans.id, id), eq(plans.accountId, accountId)) });
}

/**
 * Edita o plano. Com "applyToAccounts: true", as contas que estão neste plano
 * recebem os menus e benefícios novos.
 */
export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("planos");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  if (!(await ownPlan(auth.accountId, id))) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  const ctx = await grantContext(auth.accountId);
  if (!ctx) return NextResponse.json({ error: "Esta conta não cadastra outras contas" }, { status: 403 });
  const body = await req.json();
  const parsed = planValues(body, ctx);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [updated] = await db.update(plans).set(parsed.values).where(eq(plans.id, id)).returning();
  let applied = 0;
  if (body.applyToAccounts === true) {
    const v = parsed.values;
    const res = await db
      .update(accounts)
      .set({
        modules: v.modules,
        maxWhatsapp: v.maxWhatsapp,
        callsPerMonth: v.callsPerMonth,
        supportAccess: v.supportAccess,
        premiumAccess: v.premiumAccess,
      })
      .where(and(eq(accounts.planId, id), eq(accounts.parentId, auth.accountId)))
      .returning({ id: accounts.id });
    applied = res.length;
  }
  return NextResponse.json({ ...updated, applied });
}

export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("planos");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  if (!(await ownPlan(auth.accountId, id))) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  // As contas continuam com os menus e benefícios que já tinham; só perdem a ligação com o plano
  await db.update(accounts).set({ planId: null }).where(eq(accounts.planId, id));
  await db.delete(plans).where(eq(plans.id, id));
  return NextResponse.json({ ok: true });
}
