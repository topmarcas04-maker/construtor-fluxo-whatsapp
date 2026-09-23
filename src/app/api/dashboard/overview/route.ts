export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { requireUser, sellerScope } from "@/lib/auth/server";
import { getSubtreeIds, isInSubtree } from "@/lib/tenancy/server";
import { ensureFunnels } from "@/lib/funnel/shared";

type Row = Record<string, unknown>;

function list(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

const num = (v: unknown) => Number(v || 0);

/**
 * Visão Geral: números reais do período, da conta ativa e de todas as contas abaixo dela.
 * Query: from, to (ISO), scope (id de uma conta da árvore ou "all"), sellerId (opcional)
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser("visao-geral");
  if (auth.error) return auth.error;
  const q = req.nextUrl.searchParams;

  const now = new Date();
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.get("to") ? new Date(q.get("to")!) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  // Escopo: conta ativa inteira, ou uma conta específica abaixo dela
  let scopeRoot = auth.accountId;
  const scope = q.get("scope");
  if (scope && scope !== "all" && scope !== auth.accountId) {
    if (!(await isInSubtree(auth.accountId, scope))) {
      return NextResponse.json({ error: "Conta fora do seu acesso" }, { status: 403 });
    }
    scopeRoot = scope;
  }
  const ids = await getSubtreeIds(scopeRoot);
  const accRows = await db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, parentId: accounts.parentId })
    .from(accounts)
    .where(inArray(accounts.id, ids));

  // Vendedor: filtro escolhido ou o próprio (se o usuário é vendedor)
  const sellerId = sellerScope(auth.user) || q.get("sellerId") || null;
  // Funil (da conta ativa): o principal inclui os cards sem funil
  const funnelParam = q.get("funnel");
  const funnelRow = funnelParam ? (await ensureFunnels(db, auth.accountId)).find((f) => f.id === funnelParam) : null;
  const funnelCond = funnelRow
    ? funnelRow.isDefault
      ? sql` AND (l.funnel_id IS NULL OR l.funnel_id = ${funnelRow.id}::uuid)`
      : sql` AND l.funnel_id = ${funnelRow.id}::uuid`
    : sql``;
  const sellerLead = sql`${sellerId ? sql` AND l.seller_id = ${sellerId}::uuid` : sql``}${funnelCond}`;
  const sellerAppt = sql`${sellerId ? sql` AND a.seller_id = ${sellerId}::uuid` : sql``}${
    funnelRow ? sql` AND a.lead_id IN (SELECT l.id FROM leads l WHERE l.account_id = ${auth.accountId}::uuid ${funnelCond})` : sql``
  }`;
  const inAcc = list(ids);

  const [leadsQ, salesQ, apptQ, aiQ, hotQ] = await Promise.all([
    db.execute(sql`SELECT l.account_id, count(*)::int n FROM leads l
      WHERE l.account_id IN (${inAcc}) AND l.created_at >= ${from} AND l.created_at < ${to} ${sellerLead}
      GROUP BY l.account_id`),
    db.execute(sql`SELECT l.account_id, count(*)::int n, coalesce(sum(l.deal_value),0)::float v FROM leads l
      WHERE l.account_id IN (${inAcc}) AND l.stage = 'SALE' AND coalesce(l.closed_at, l.updated_at) >= ${from}
        AND coalesce(l.closed_at, l.updated_at) < ${to} ${sellerLead}
      GROUP BY l.account_id`),
    db.execute(sql`SELECT a.account_id,
        count(*) FILTER (WHERE a.status <> 'CANCELED')::int n,
        count(*) FILTER (WHERE a.status = 'DONE')::int done,
        count(*) FILTER (WHERE a.status = 'SCHEDULED' AND a.starts_at >= now())::int upcoming
      FROM appointments a
      WHERE a.account_id IN (${inAcc}) AND a.starts_at >= ${from} AND a.starts_at < ${to} ${sellerAppt}
      GROUP BY a.account_id`),
    db.execute(sql`SELECT c.account_id, count(DISTINCT m.conversation_id)::int n
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN leads l ON l.conversation_id = c.id
      WHERE c.account_id IN (${inAcc}) AND m.sender = 'AI' AND m.sent_at >= ${from} AND m.sent_at < ${to} ${sellerLead}
      GROUP BY c.account_id`),
    db.execute(sql`SELECT count(*)::int n FROM leads l
      WHERE l.account_id IN (${inAcc}) AND l.stage = 'HOT_LEAD' AND l.closed = false ${sellerLead}`),
  ]);

  // Números por conta (e somados subindo na árvore)
  const raw = new Map<string, { leads: number; sales: number; value: number; appointments: number; ai: number }>();
  const get = (id: string) => {
    if (!raw.has(id)) raw.set(id, { leads: 0, sales: 0, value: 0, appointments: 0, ai: 0 });
    return raw.get(id)!;
  };
  for (const r of leadsQ.rows as Row[]) get(r.account_id as string).leads = num(r.n);
  for (const r of salesQ.rows as Row[]) {
    get(r.account_id as string).sales = num(r.n);
    get(r.account_id as string).value = num(r.v);
  }
  let apptDone = 0;
  let apptUpcoming = 0;
  for (const r of apptQ.rows as Row[]) {
    get(r.account_id as string).appointments = num(r.n);
    apptDone += num(r.done);
    apptUpcoming += num(r.upcoming);
  }
  for (const r of aiQ.rows as Row[]) get(r.account_id as string).ai = num(r.n);

  const total = { leads: 0, sales: 0, value: 0, appointments: 0, ai: 0 };
  for (const v of raw.values()) {
    total.leads += v.leads;
    total.sales += v.sales;
    total.value += v.value;
    total.appointments += v.appointments;
    total.ai += v.ai;
  }

  // Desempenho de cada conta logo abaixo do escopo (somando os clientes dela)
  const parentOf = new Map(accRows.map((a) => [a.id, a.parentId]));
  const rollupTarget = (id: string) => {
    let cur: string | null | undefined = id;
    while (cur && parentOf.get(cur) !== scopeRoot && cur !== scopeRoot) cur = parentOf.get(cur);
    return cur;
  };
  const byAccountMap = new Map<string, typeof total>();
  for (const [id, v] of raw) {
    const target = rollupTarget(id);
    if (!target) continue;
    const agg = byAccountMap.get(target) || { leads: 0, sales: 0, value: 0, appointments: 0, ai: 0 };
    agg.leads += v.leads;
    agg.sales += v.sales;
    agg.value += v.value;
    agg.appointments += v.appointments;
    agg.ai += v.ai;
    byAccountMap.set(target, agg);
  }
  const byAccount = accRows
    .filter((a) => a.id === scopeRoot || a.parentId === scopeRoot)
    .map((a) => ({
      id: a.id,
      name: a.id === scopeRoot ? `${a.name} (própria)` : a.name,
      type: a.type,
      own: a.id === scopeRoot,
      ...(a.id === scopeRoot ? raw.get(a.id) || { leads: 0, sales: 0, value: 0, appointments: 0, ai: 0 } : byAccountMap.get(a.id) || { leads: 0, sales: 0, value: 0, appointments: 0, ai: 0 }),
    }))
    .sort((a, b) => Number(b.own) - Number(a.own) || b.value - a.value || b.leads - a.leads);

  // Por vendedor
  const sellerQ = await db.execute(sql`
    SELECT s.id, s.name, acc.name AS account_name,
      (SELECT count(*)::int FROM leads l WHERE l.seller_id = s.id AND l.created_at >= ${from} AND l.created_at < ${to}) AS leads,
      (SELECT count(*)::int FROM leads l WHERE l.seller_id = s.id AND l.stage = 'SALE'
         AND coalesce(l.closed_at, l.updated_at) >= ${from} AND coalesce(l.closed_at, l.updated_at) < ${to}) AS sales,
      (SELECT coalesce(sum(l.deal_value),0)::float FROM leads l WHERE l.seller_id = s.id AND l.stage = 'SALE'
         AND coalesce(l.closed_at, l.updated_at) >= ${from} AND coalesce(l.closed_at, l.updated_at) < ${to}) AS value,
      (SELECT count(*)::int FROM appointments a WHERE a.seller_id = s.id AND a.status <> 'CANCELED'
         AND a.starts_at >= ${from} AND a.starts_at < ${to}) AS appointments
    FROM sellers s JOIN accounts acc ON acc.id = s.account_id
    WHERE s.account_id IN (${inAcc}) ${sellerId ? sql`AND s.id = ${sellerId}::uuid` : sql``}
    ORDER BY value DESC, sales DESC, leads DESC, s.name
    LIMIT 50`);

  // Sua atenção (situação de agora, não do período)
  const [waitingQ, hotNoSellerQ, todayQ, failedQ] = await Promise.all([
    db.execute(sql`SELECT count(*)::int n FROM leads l JOIN conversations c ON c.id = l.conversation_id
      WHERE l.account_id IN (${inAcc}) AND l.closed = false ${sellerLead}
        AND (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC LIMIT 1) = 'IN'
        AND c.last_message_at < now() - interval '15 minutes'`),
    db.execute(sql`SELECT count(*)::int n FROM leads l
      WHERE l.account_id IN (${inAcc}) AND l.stage = 'HOT_LEAD' AND l.seller_id IS NULL AND l.closed = false`),
    db.execute(sql`SELECT count(*)::int n FROM appointments a
      WHERE a.account_id IN (${inAcc}) AND a.status = 'SCHEDULED' ${sellerAppt}
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`),
    db.execute(sql`SELECT count(*)::int n FROM appointments a
      WHERE a.account_id IN (${inAcc}) AND a.reminder_error IS NOT NULL AND a.reminder_sent_at IS NULL
        AND a.status = 'SCHEDULED' ${sellerAppt}`),
  ]);
  const attention = [
    { key: "waiting", count: num((waitingQ.rows[0] as Row)?.n), title: "Clientes aguardando resposta", detail: "Última mensagem é do cliente há mais de 15 min", href: "/leads" },
    { key: "hot", count: num((hotNoSellerQ.rows[0] as Row)?.n), title: "Leads quentes sem vendedor", detail: "Atribua um vendedor para não perder a venda", href: "/leads" },
    { key: "today", count: num((todayQ.rows[0] as Row)?.n), title: "Agendamentos de hoje", detail: "Compromissos marcados para hoje", href: "/agenda" },
    { key: "failed", count: num((failedQ.rows[0] as Row)?.n), title: "Lembretes com falha", detail: "O WhatsApp da conta estava desconectado", href: "/agenda" },
  ].filter((a) => a.count > 0);

  // Últimas atualizações
  const updatesQ = await db.execute(sql`
    (SELECT 'sale' AS kind, coalesce(l.closed_at, l.updated_at) AS at, coalesce(l.card_name, 'Lead') AS title,
        acc.name AS account, l.deal_value::float AS value
      FROM leads l JOIN accounts acc ON acc.id = l.account_id
      WHERE l.account_id IN (${inAcc}) AND l.stage = 'SALE' ${sellerLead}
      ORDER BY at DESC LIMIT 5)
    UNION ALL
    (SELECT 'appointment', a.created_at, a.title, acc.name, NULL
      FROM appointments a JOIN accounts acc ON acc.id = a.account_id
      WHERE a.account_id IN (${inAcc}) ${sellerAppt}
      ORDER BY a.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'lead', l.created_at, coalesce(l.card_name, 'Lead'), acc.name, NULL
      FROM leads l JOIN accounts acc ON acc.id = l.account_id
      WHERE l.account_id IN (${inAcc}) ${sellerLead}
      ORDER BY l.created_at DESC LIMIT 5)
    ORDER BY at DESC LIMIT 8`);

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    scope: { id: scopeRoot, name: accRows.find((a) => a.id === scopeRoot)?.name, type: accRows.find((a) => a.id === scopeRoot)?.type, accounts: ids.length },
    kpis: {
      sales: { count: total.sales, value: total.value },
      appointments: { count: total.appointments, done: apptDone, upcoming: apptUpcoming },
      leads: { count: total.leads },
      ai: { conversations: total.ai },
      hot: { count: num((hotQ.rows[0] as Row)?.n) },
      conversion: total.leads ? Math.round((total.sales / total.leads) * 1000) / 10 : 0,
    },
    attention,
    updates: updatesQ.rows,
    byAccount,
    bySeller: sellerQ.rows,
  });
}
