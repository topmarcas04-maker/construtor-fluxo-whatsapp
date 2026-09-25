/**
 * Recontato — consultas usadas pelo site (fila na tela) e pelo motor (envio). Sem imports "@/".
 */
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { normalizeStage } from "../funnel/common";
import { nextFollowup, withDefaults, type FollowupSettings } from "./common";

type Db = NodePgDatabase<typeof schema>;

export async function loadFollowup(db: Db, accountId: string): Promise<FollowupSettings> {
  const row = await db.query.followupSettings.findFirst({ where: eq(schema.followupSettings.id, accountId) });
  return withDefaults((row?.config || null) as Partial<FollowupSettings> | null);
}

export interface FollowupCandidate {
  leadId: string;
  conversationId: string;
  phoneJid: string;
  name: string | null;
  fuCount: number;
  fuLastAt: Date | null;
  lastAt: Date;
  lastSender: string | null;
  botId: string | null;
  botStep: string | null;
  funnelId: string | null;
  next: NonNullable<ReturnType<typeof nextFollowup>>;
}

/**
 * Leads que estão no recontato: WhatsApp, a última mensagem é da empresa, o cliente já falou
 * alguma vez, sem venda e passando nos filtros da configuração. Devolve o próximo passo de cada um.
 */
export async function followupCandidates(db: Db, accountId: string, s: FollowupSettings, now = new Date()) {
  const rows = await db.execute(sql`
    SELECT l.id, l.conversation_id, c.phone_jid, coalesce(nullif(l.card_name, 'Lead'), c.lead_name) AS name,
           l.fu_count, l.fu_last_at, l.score, l.stage, l.column_id, l.funnel_id, l.seller_id, l.ai_paused,
           l.bot_id, l.bot_step, lm.sent_at AS last_at, lm.sender AS last_sender,
           coalesce((SELECT json_agg(lt.tag_id) FROM lead_tags lt WHERE lt.lead_id = l.id), '[]') AS tag_ids
      FROM leads l
      JOIN conversations c ON c.id = l.conversation_id
      JOIN LATERAL (
        SELECT m.sent_at, m.direction, m.sender FROM messages m
         WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC LIMIT 1
      ) lm ON true
     WHERE l.account_id = ${accountId}
       AND c.channel = 'WHATSAPP'
       AND l.closed = false
       AND lm.direction = 'OUT'
       AND coalesce(lm.sender, '') <> 'BROADCAST'
       AND EXISTS (SELECT 1 FROM messages mi WHERE mi.conversation_id = c.id AND mi.direction = 'IN')
  `);

  // Colunas: para filtrar por coluna e não mexer em quem já está em "Desqualificado"
  const cols = await db
    .select({ id: schema.funnelColumns.id, name: schema.funnelColumns.name, kind: schema.funnelColumns.kind, funnelId: schema.funnelColumns.funnelId })
    .from(schema.funnelColumns)
    .where(eq(schema.funnelColumns.accountId, accountId));
  const funnels = await db
    .select({ id: schema.funnels.id, isDefault: schema.funnels.isDefault })
    .from(schema.funnels)
    .where(eq(schema.funnels.accountId, accountId));
  const defaultFunnel = funnels.find((f) => f.isDefault)?.id || null;
  const dqName = (s.disqualifiedColumnName || "").trim().toLowerCase();

  const out: FollowupCandidate[] = [];
  for (const r of rows.rows as Record<string, unknown>[]) {
    const stage = normalizeStage(String(r.stage));
    if (stage === "SALE") continue;
    if (r.seller_id && !s.includeWithSeller) continue;
    if (r.ai_paused && !r.bot_id && !s.includeTeam) continue;
    if (s.maxScore != null && r.score != null && Number(r.score) > s.maxScore) continue;
    const tagIds = (typeof r.tag_ids === "string" ? JSON.parse(r.tag_ids) : r.tag_ids) as string[];
    if (s.skipTagIds.some((t) => tagIds.includes(t))) continue;

    // Coluna em que o card aparece
    const funnelId = (r.funnel_id as string | null) || defaultFunnel;
    const col = r.column_id
      ? cols.find((c) => c.id === r.column_id)
      : cols.find((c) => c.funnelId === funnelId && c.kind === stage);
    if (col && dqName && col.name.trim().toLowerCase() === dqName) continue;
    if (s.columnIds.length && (!col || !s.columnIds.includes(col.id))) continue;

    const state = {
      id: String(r.id),
      fuCount: Number(r.fu_count || 0),
      fuLastAt: (r.fu_last_at as Date | null) || null,
      lastAt: new Date(r.last_at as string),
      lastSender: (r.last_sender as string | null) || null,
    };
    const next = nextFollowup(state, s, now);
    if (!next) continue;
    out.push({
      leadId: state.id,
      conversationId: String(r.conversation_id),
      phoneJid: String(r.phone_jid),
      name: (r.name as string | null) || null,
      fuCount: state.fuCount,
      fuLastAt: state.fuLastAt ? new Date(state.fuLastAt) : null,
      lastAt: state.lastAt,
      lastSender: state.lastSender,
      botId: (r.bot_id as string | null) || null,
      botStep: (r.bot_step as string | null) || null,
      funnelId: (r.funnel_id as string | null) || null,
      next,
    });
  }
  return out.sort((a, b) => a.next.at.getTime() - b.next.at.getTime());
}

/** Coluna "Desqualificado" no funil do lead (cria se não existir) */
export async function ensureDisqualifiedColumn(db: Db, accountId: string, funnelId: string | null, name: string) {
  const funnels = await db.select().from(schema.funnels).where(eq(schema.funnels.accountId, accountId));
  const fid = funnelId || funnels.find((f) => f.isDefault)?.id || null;
  const cols = await db
    .select()
    .from(schema.funnelColumns)
    .where(and(eq(schema.funnelColumns.accountId, accountId), fid ? eq(schema.funnelColumns.funnelId, fid) : sql`true`));
  const found = cols.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (found) return found.id;
  const [created] = await db
    .insert(schema.funnelColumns)
    .values({
      accountId,
      funnelId: fid,
      name: name.trim().slice(0, 60),
      kind: "CUSTOM",
      color: "rose",
      sort: cols.reduce((m, c) => Math.max(m, c.sort), 0) + 1,
    } as typeof schema.funnelColumns.$inferInsert)
    .returning({ id: schema.funnelColumns.id });
  return created.id;
}
