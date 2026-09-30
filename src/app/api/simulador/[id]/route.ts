export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cardMachines } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { machineValues } from "@/lib/simulador/common";

async function own(id: string, accountId: string) {
  return db.query.cardMachines.findFirst({ where: and(eq(cardMachines.id, id), eq(cardMachines.accountId, accountId)) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  if (!auth.user.canManage) return NextResponse.json({ error: "Só o administrador edita maquininhas" }, { status: 403 });
  const { id } = await params;
  if (!(await own(id, auth.accountId))) return NextResponse.json({ error: "Maquininha não encontrada" }, { status: 404 });
  const parsed = machineValues(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await db.update(cardMachines).set({ ...parsed.values, updatedAt: new Date() }).where(eq(cardMachines.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("simulador");
  if (auth.error) return auth.error;
  if (!auth.user.canManage) return NextResponse.json({ error: "Só o administrador remove maquininhas" }, { status: 403 });
  const { id } = await params;
  if (!(await own(id, auth.accountId))) return NextResponse.json({ error: "Maquininha não encontrada" }, { status: 404 });
  await db.delete(cardMachines).where(eq(cardMachines.id, id));
  return NextResponse.json({ ok: true });
}
