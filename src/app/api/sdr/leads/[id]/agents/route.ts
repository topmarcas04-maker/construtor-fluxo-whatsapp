export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentEvents, leads } from "@/db/schema";
import { requireUser, sellerScope } from "@/lib/auth/server";
import { ensureAgents } from "@/lib/agents/shared";

/** Agente atual do lead, agentes disponíveis e o histórico (encaminhamentos, trocas, agendamentos...) */
export async function GET(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Lead inválido" }, { status: 400 });
  const lead = await db.query.leads.findFirst({ where: and(eq(leads.id, id), eq(leads.accountId, auth.accountId)) });
  const onlySeller = sellerScope(auth.user);
  if (!lead || (onlySeller && lead.sellerId !== onlySeller)) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  const [agents, events] = await Promise.all([
    ensureAgents(db, auth.accountId),
    db
      .select({ id: agentEvents.id, kind: agentEvents.kind, detail: agentEvents.detail, agentName: agentEvents.agentName, createdAt: agentEvents.createdAt })
      .from(agentEvents)
      .where(and(eq(agentEvents.accountId, auth.accountId), eq(agentEvents.leadId, id)))
      .orderBy(desc(agentEvents.createdAt))
      .limit(50),
  ]);
  const primary = agents.find((a) => a.isPrimary);
  return NextResponse.json({
    agentId: lead.agentId || primary?.id || null,
    agents: agents.map((a) => ({ id: a.id, name: a.name, active: a.active, isPrimary: a.isPrimary })),
    events,
  });
}
