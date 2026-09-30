export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, cardMachines } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { machineValues, taxValue } from "@/lib/simulador/common";
import { effectiveTax, listMachines } from "@/lib/simulador/server";

export async function GET() {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  const tax = await effectiveTax(auth.accountId);
  return NextResponse.json({
    machines: await listMachines(auth.accountId),
    canEdit: auth.user.canManage,
    taxRate: tax.taxRate,
    /** Nome da conta de onde vem o imposto (Cliente usa o do Parceiro) */
    taxSource: tax.source,
    /** Só Master e Parceiro (administradores) mudam o imposto */
    canEditTax: auth.user.canManage && auth.user.account.type !== "CLIENT",
  });
}

/** Imposto sobre a nota da conta (Master e Parceiro) */
export async function PUT(req: NextRequest) {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  if (!auth.user.canManage || auth.user.account.type === "CLIENT") {
    return NextResponse.json({ error: "O imposto é definido pelo parceiro" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = taxValue(body.taxRate);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await db.update(accounts).set({ simTaxRate: parsed.value }).where(eq(accounts.id, auth.accountId));
  return NextResponse.json({ ok: true, taxRate: parsed.value ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  if (!auth.user.canManage) return NextResponse.json({ error: "Só o administrador cadastra maquininhas" }, { status: 403 });
  const parsed = machineValues(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cardMachines)
    .where(eq(cardMachines.accountId, auth.accountId));
  if (n >= 20) return NextResponse.json({ error: "Limite de 20 maquininhas por conta" }, { status: 400 });
  const [row] = await db.insert(cardMachines).values({ ...parsed.values, accountId: auth.accountId, sort: n }).returning({ id: cardMachines.id });
  return NextResponse.json(row, { status: 201 });
}
