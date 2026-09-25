export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accountServices, plans } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { grantContext, planValues } from "@/lib/plans/server";

/** Planos que a conta ativa oferece + o que ela pode colocar neles + os dados de suporte dela */
export async function GET() {
  const auth = await requireUser(["planos", "parceiros"]);
  if (auth.error) return auth.error;
  const ctx = await grantContext(auth.accountId);
  if (!ctx) return NextResponse.json({ error: "Esta conta não cadastra outras contas" }, { status: 403 });
  const [rows, svc] = await Promise.all([
    db.query.plans.findMany({ where: eq(plans.accountId, auth.accountId), orderBy: [asc(plans.sort), asc(plans.createdAt)] }),
    db.query.accountServices.findFirst({ where: eq(accountServices.accountId, auth.accountId) }),
  ]);
  return NextResponse.json({
    plans: rows,
    childType: ctx.childType,
    grantable: ctx.grantable,
    ceiling: ctx.ceiling,
    services: { supportPhone: svc?.supportPhone || "", supportHours: svc?.supportHours || "" },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("planos");
  if (auth.error) return auth.error;
  const ctx = await grantContext(auth.accountId);
  if (!ctx) return NextResponse.json({ error: "Esta conta não cadastra outras contas" }, { status: 403 });
  const parsed = planValues(await req.json(), ctx);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [created] = await db.insert(plans).values({ ...parsed.values, accountId: auth.accountId }).returning();
  return NextResponse.json(created, { status: 201 });
}
