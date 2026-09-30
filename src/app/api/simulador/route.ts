export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cardMachines } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { machineValues } from "@/lib/simulador/common";
import { listMachines } from "@/lib/simulador/server";

export async function GET() {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  return NextResponse.json({ machines: await listMachines(auth.accountId), canEdit: auth.user.canManage });
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
