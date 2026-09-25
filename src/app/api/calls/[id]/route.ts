export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportCalls } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { CALL_MIN_LEAD_HOURS } from "@/lib/calls/common";
import { notifyCall } from "@/lib/calls/server";

/**
 * Quem marcou pode cancelar (até 2h antes). Quem atende pode cancelar, marcar como realizada
 * ou falta, e trocar o link/anotações.
 */
export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("calls");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const call = await db.query.supportCalls.findFirst({ where: eq(supportCalls.id, id) });
  if (!call) return NextResponse.json({ error: "Call não encontrada" }, { status: 404 });
  const isProvider = call.providerAccountId === auth.accountId && auth.user.canManage;
  const isClient = call.clientAccountId === auth.accountId;
  if (!isProvider && !isClient) return NextResponse.json({ error: "Call não encontrada" }, { status: 404 });

  const body = await req.json();
  const set: Record<string, unknown> = {};
  const action = String(body.action || "");
  if (action === "cancel") {
    if (call.status !== "SCHEDULED") return NextResponse.json({ error: "Esta call não está agendada" }, { status: 400 });
    if (!isProvider && call.startsAt.getTime() - Date.now() < CALL_MIN_LEAD_HOURS * 3600e3) {
      return NextResponse.json({ error: `Só dá para cancelar até ${CALL_MIN_LEAD_HOURS}h antes. Fale com o suporte.` }, { status: 400 });
    }
    set.status = "CANCELED";
  } else if (isProvider && (action === "done" || action === "no_show" || action === "reopen")) {
    set.status = action === "done" ? "DONE" : action === "no_show" ? "NO_SHOW" : "SCHEDULED";
  }
  if (isProvider && body.meetingLink !== undefined) set.meetingLink = String(body.meetingLink || "").trim().slice(0, 500) || null;
  if (isProvider && body.notes !== undefined) set.notes = String(body.notes || "").slice(0, 2000) || null;
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nada para mudar" }, { status: 400 });
  const [updated] = await db.update(supportCalls).set(set).where(eq(supportCalls.id, id)).returning();
  if (set.status === "CANCELED") await notifyCall(updated, "canceled");
  return NextResponse.json(updated);
}
