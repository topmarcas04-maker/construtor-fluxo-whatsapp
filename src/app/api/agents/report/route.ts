export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agentEvents, aiUsage, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureAgents } from "@/lib/agents/shared";
import { usageCost } from "@/lib/ai/usage";

/** Relatório por agente no período (?days=7|30|90) + consumo de IA da conta */
export async function GET(req: NextRequest) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 864e5);
  const accountId = auth.accountId;

  const [agents, events, usage, sales, newLeads] = await Promise.all([
    ensureAgents(db, accountId),
    db
      .select({ agentId: agentEvents.agentId, leadId: agentEvents.leadId, kind: agentEvents.kind, meta: agentEvents.meta })
      .from(agentEvents)
      .where(and(eq(agentEvents.accountId, accountId), gte(agentEvents.createdAt, since))),
    db
      .select({
        agentId: aiUsage.agentId,
        model: aiUsage.model,
        kind: aiUsage.kind,
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
        output: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.accountId, accountId), gte(aiUsage.createdAt, since)))
      .groupBy(aiUsage.agentId, aiUsage.model, aiUsage.kind),
    db
      .select({ id: leads.id, agentId: leads.agentId })
      .from(leads)
      .where(and(eq(leads.accountId, accountId), eq(leads.closed, true), gte(leads.closedAt, since))),
    db
      .select({ id: leads.id, agentId: leads.agentId })
      .from(leads)
      .where(and(eq(leads.accountId, accountId), gte(leads.createdAt, since))),
  ]);

  const primaryId = agents.find((a) => a.isPrimary)?.id || null;
  const rows = agents.map((a) => {
    const mine = events.filter((e) => e.agentId === a.id);
    const leadIds = new Set<string>();
    for (const e of mine) if (e.leadId) leadIds.add(e.leadId);
    for (const e of events) if (e.kind === "TRANSFER" && (e.meta as { to?: string } | null)?.to === a.id && e.leadId) leadIds.add(e.leadId);
    for (const l of newLeads) if ((l.agentId || primaryId) === a.id) leadIds.add(l.id);
    const count = (k: string) => mine.filter((e) => e.kind === k).length;
    const handoffs = mine.filter((e) => e.kind === "HANDOFF_SELLER");
    const transfersOut = count("TRANSFER");
    const transfersIn = events.filter((e) => e.kind === "TRANSFER" && (e.meta as { to?: string } | null)?.to === a.id).length;
    const passedOn = new Set([...handoffs, ...mine.filter((e) => e.kind === "TRANSFER")].map((e) => e.leadId).filter(Boolean));
    const minutes = handoffs.map((e) => Number((e.meta as { minutes?: number } | null)?.minutes)).filter((n) => Number.isFinite(n) && n >= 0);
    const u = usage.filter((x) => x.agentId === a.id);
    const tokensIn = u.reduce((s, x) => s + x.input, 0);
    const tokensOut = u.reduce((s, x) => s + x.output, 0);
    return {
      id: a.id,
      name: a.name,
      isPrimary: a.isPrimary,
      active: a.active,
      leads: leadIds.size,
      replies: u.filter((x) => x.kind === "REPLY").reduce((s, x) => s + x.calls, 0),
      qualified: count("QUALIFIED"),
      appointments: count("APPOINTMENT"),
      actions: count("ACTION"),
      transfersOut,
      transfersIn,
      toSellers: handoffs.length,
      sales: sales.filter((l) => l.agentId === a.id || mine.some((e) => e.leadId === l.id)).length,
      resolvedPct: leadIds.size ? Math.round((100 * [...leadIds].filter((id) => !passedOn.has(id)).length) / leadIds.size) : null,
      minutesToHuman: minutes.length ? Math.round(minutes.reduce((s, n) => s + n, 0) / minutes.length) : null,
      tokensIn,
      tokensOut,
      cost: u.reduce((s, x) => s + usageCost(x.model, x.input, x.output), 0),
    };
  });

  const byKind: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }> = {};
  for (const x of usage) {
    const k = (byKind[x.kind] ||= { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
    k.calls += x.calls;
    k.tokensIn += x.input;
    k.tokensOut += x.output;
    k.cost += usageCost(x.model, x.input, x.output);
  }
  const total = Object.values(byKind).reduce(
    (s, k) => ({ calls: s.calls + k.calls, tokensIn: s.tokensIn + k.tokensIn, tokensOut: s.tokensOut + k.tokensOut, cost: s.cost + k.cost }),
    { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 }
  );
  return NextResponse.json({ days, agents: rows, usage: { byKind, total } });
}
