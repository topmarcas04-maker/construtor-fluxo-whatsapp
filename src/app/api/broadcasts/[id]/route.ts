export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { broadcastRecipients, broadcasts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

async function own(accountId: string, id: string) {
  return db.query.broadcasts.findFirst({ where: and(eq(broadcasts.id, id), eq(broadcasts.accountId, accountId)) });
}

/** Detalhe: o disparo e os destinatários (os 500 mais recentes) */
export async function GET(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const b = await own(auth.accountId, id);
  if (!b) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  const recipients = await db
    .select()
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, id))
    .orderBy(desc(broadcastRecipients.sentAt), broadcastRecipients.name)
    .limit(500);
  return NextResponse.json({ broadcast: b, recipients });
}

/** Pausar, continuar ou cancelar */
export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const b = await own(auth.accountId, id);
  if (!b) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  const action = String((await req.json()).action || "");
  const set: Record<string, unknown> = {};
  if (action === "pause" && ["SCHEDULED", "RUNNING"].includes(b.status)) set.status = "PAUSED";
  else if (action === "resume" && b.status === "PAUSED") {
    set.status = "RUNNING";
    set.nextAt = new Date();
  } else if (action === "cancel" && !["DONE", "CANCELED"].includes(b.status)) {
    set.status = "CANCELED";
    set.finishedAt = new Date();
    await db
      .update(broadcastRecipients)
      .set({ status: "SKIPPED" })
      .where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, "PENDING")));
  } else return NextResponse.json({ error: "Ação inválida para este disparo" }, { status: 400 });
  const [updated] = await db.update(broadcasts).set(set).where(eq(broadcasts.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const b = await own(auth.accountId, id);
  if (!b) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  if (b.status === "RUNNING") return NextResponse.json({ error: "Pause ou cancele antes de excluir" }, { status: 400 });
  await db.delete(broadcasts).where(eq(broadcasts.id, id));
  return NextResponse.json({ ok: true });
}
