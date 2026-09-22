export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appointments } from "@/db/schema";
import { requireUser, sellerScope } from "@/lib/auth/server";
import { appointmentValues } from "../shared";

async function load(id: string, accountId: string) {
  return db.query.appointments.findFirst({ where: and(eq(appointments.id, id), eq(appointments.accountId, accountId)) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("agenda");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const current = await load(id, auth.accountId);
  if (!current) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  const onlySeller = sellerScope(auth.user);
  if (onlySeller && current.sellerId !== onlySeller) {
    return NextResponse.json({ error: "Este agendamento é de outro vendedor" }, { status: 403 });
  }
  const parsed = await appointmentValues(await req.json(), auth.accountId, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.values;
  // Mudou o horário ou o aviso: o lembrete volta a ser enviado
  const startsChanged = v.startsAt && (v.startsAt as Date).getTime() !== current.startsAt.getTime();
  const minutesChanged =
    v.reminderMinutesBefore !== undefined && v.reminderMinutesBefore !== current.reminderMinutesBefore;
  const reEnabled = v.reminderEnabled === true && !current.reminderEnabled;
  if (startsChanged || minutesChanged || reEnabled) {
    v.reminderSentAt = null;
    v.reminderError = null;
  }
  v.updatedAt = new Date();
  const [updated] = await db.update(appointments).set(v).where(eq(appointments.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("agenda");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const current = await load(id, auth.accountId);
  if (!current) return NextResponse.json({ ok: true });
  const onlySeller = sellerScope(auth.user);
  if (onlySeller && current.sellerId !== onlySeller) {
    return NextResponse.json({ error: "Este agendamento é de outro vendedor" }, { status: 403 });
  }
  await db.delete(appointments).where(eq(appointments.id, id));
  return NextResponse.json({ ok: true });
}
