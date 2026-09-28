export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, followupEvents, leads, sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { fromSpDateTime } from "@/lib/time";

type Ev = typeof followupEvents.$inferSelect;

/**
 * GET /api/sdr/followup/report?from=AAAA-MM-DD&to=AAAA-MM-DD&followupId=&sellerId=
 * Números do recontato e da cobertura do vendedor no período (horário de Brasília).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const q = req.nextUrl.searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") || "") ? (q.get("from") as string) : null;
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(q.get("to") || "") ? (q.get("to") as string) : today;
  const from = (fromStr && fromSpDateTime(fromStr, "00:00")) || new Date(Date.now() - 30 * 864e5);
  const to = new Date(((fromSpDateTime(toStr, "00:00") || new Date()).getTime()) + 864e5 - 1);
  const followupId = q.get("followupId") || "";
  const sellerId = q.get("sellerId") || "";

  const all = await db
    .select()
    .from(followupEvents)
    .where(and(eq(followupEvents.accountId, auth.accountId), gte(followupEvents.createdAt, from), lte(followupEvents.createdAt, to)))
    .orderBy(followupEvents.createdAt);

  const bySeller = (e: Ev) => !sellerId || (sellerId === "sem" ? !e.sellerId : e.sellerId === sellerId);
  const fu = all.filter((e) => e.kind !== "COVER" && bySeller(e) && (!followupId || e.followupId === followupId));
  const cov = all.filter((e) => e.kind === "COVER" && bySeller(e));

  // Leads (nome, telefone, etapa, vendedor)
  const leadIds = [...new Set([...fu, ...cov].map((e) => e.leadId).filter(Boolean) as string[])];
  const leadRows = leadIds.length
    ? await db
        .select({
          id: leads.id,
          cardName: leads.cardName,
          phone: leads.phone,
          stage: leads.stage,
          sellerId: leads.sellerId,
          leadName: conversations.leadName,
          phoneJid: conversations.phoneJid,
        })
        .from(leads)
        .innerJoin(conversations, eq(conversations.id, leads.conversationId))
        .where(and(eq(leads.accountId, auth.accountId), inArray(leads.id, leadIds)))
    : [];
  const leadMap = new Map(leadRows.map((l) => [l.id, l]));
  const sellerRows = await db.select({ id: sellers.id, name: sellers.name }).from(sellers).where(eq(sellers.accountId, auth.accountId));
  const sellerName = (id: string | null) => (id ? sellerRows.find((s) => s.id === id)?.name || "Vendedor removido" : "Sem vendedor");

  // Por lead: o que aconteceu no período
  interface Row {
    leadId: string;
    followupName: string;
    sellerId: string | null;
    sent: number;
    replied: boolean;
    repliedAttempt: number | null;
    handoff: boolean;
    final: boolean;
    lastAt: Date;
  }
  const rows = new Map<string, Row>();
  const attempts = new Map<number, { sent: number; replied: number }>();
  for (const e of fu) {
    if (!e.leadId) continue;
    const r =
      rows.get(e.leadId) ||
      ({ leadId: e.leadId, followupName: e.followupName || "Recontato", sellerId: e.sellerId, sent: 0, replied: false, repliedAttempt: null, handoff: false, final: false, lastAt: e.createdAt } as Row);
    r.lastAt = e.createdAt;
    if (e.followupName) r.followupName = e.followupName;
    if (e.sellerId) r.sellerId = e.sellerId;
    if (e.kind === "SENT") {
      r.sent = Math.max(r.sent, e.attempt || 1);
      // Mandou de novo depois de responder: começou uma nova rodada
      if (r.replied || r.final) {
        r.replied = false;
        r.final = false;
        r.handoff = false;
      }
      const a = attempts.get(e.attempt || 1) || { sent: 0, replied: 0 };
      a.sent++;
      attempts.set(e.attempt || 1, a);
    } else if (e.kind === "REPLIED") {
      r.replied = true;
      r.repliedAttempt = e.attempt;
      const a = attempts.get(e.attempt || 1) || { sent: 0, replied: 0 };
      a.replied++;
      attempts.set(e.attempt || 1, a);
    } else if (e.kind === "HANDOFF") r.handoff = true;
    else if (e.kind === "FINAL") r.final = true;
    rows.set(e.leadId, r);
  }

  const list = [...rows.values()];
  const entered = new Set(fu.filter((e) => e.kind === "SENT" && (e.attempt || 1) === 1).map((e) => e.leadId)).size;
  const replied = list.filter((r) => r.replied).length;
  const sales = list.filter((r) => r.replied && leadMap.get(r.leadId)?.stage === "SALE").length;

  // Cobertura por vendedor
  const coverBy = new Map<string, number>();
  for (const e of cov) coverBy.set(e.sellerId || "", (coverBy.get(e.sellerId || "") || 0) + 1);

  // Por recontato
  const byFollowup = new Map<string, { id: string; name: string; entered: number; replied: number; handoff: number; final: number }>();
  for (const e of fu) {
    const key = e.followupId || "?";
    const b = byFollowup.get(key) || { id: key, name: e.followupName || "Recontato", entered: 0, replied: 0, handoff: 0, final: 0 };
    if (e.kind === "SENT" && (e.attempt || 1) === 1) b.entered++;
    if (e.kind === "REPLIED") b.replied++;
    if (e.kind === "HANDOFF") b.handoff++;
    if (e.kind === "FINAL") b.final++;
    byFollowup.set(key, b);
  }

  const leadInfo = (id: string) => {
    const l = leadMap.get(id);
    const name = l ? (l.cardName && l.cardName !== "Lead" ? l.cardName : l.leadName) || null : null;
    const phone = l?.phone || (l?.phoneJid?.endsWith("@s.whatsapp.net") ? l.phoneJid.split("@")[0] : null);
    return { name, phone, stage: l?.stage || null };
  };

  const leadList = [
    ...list.map((r) => ({
      leadId: r.leadId,
      ...leadInfo(r.leadId),
      followupName: r.followupName,
      seller: sellerName(r.sellerId),
      sent: r.sent,
      status: r.handoff ? "HANDOFF" : r.replied ? "REPLIED" : r.final ? "FINAL" : "RUNNING",
      repliedAttempt: r.repliedAttempt,
      at: r.lastAt,
    })),
    ...cov.map((e) => ({
      leadId: e.leadId as string,
      ...leadInfo(e.leadId as string),
      followupName: "Cobertura do vendedor",
      seller: sellerName(e.sellerId),
      sent: 0,
      status: "COVER",
      repliedAttempt: null,
      at: e.createdAt,
    })),
  ]
    .filter((r) => r.leadId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 400);

  return NextResponse.json({
    from,
    to,
    summary: {
      entered,
      sent: fu.filter((e) => e.kind === "SENT").length,
      replied,
      leads: list.length,
      replyRate: list.length ? Math.round((replied / list.length) * 100) : 0,
      handoff: list.filter((r) => r.handoff).length,
      sales,
      final: list.filter((r) => r.final && !r.replied).length,
      running: list.filter((r) => !r.replied && !r.final).length,
      cover: cov.length,
    },
    attempts: [...attempts.entries()].sort((a, b) => a[0] - b[0]).map(([attempt, v]) => ({ attempt, ...v })),
    byFollowup: [...byFollowup.values()],
    cover: [...coverBy.entries()].map(([id, count]) => ({ sellerId: id || null, name: sellerName(id || null), count })).sort((a, b) => b.count - a.count),
    sellers: sellerRows,
    leads: leadList,
  });
}
