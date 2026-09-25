/**
 * Disparos — público (leads que passam nos filtros). Usado pelo site. Sem imports "@/".
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { normalizeStage } from "../funnel/common";
import type { BroadcastFilters } from "./common";

type Db = NodePgDatabase<typeof schema>;

export interface AudienceLead {
  leadId: string;
  conversationId: string;
  phoneJid: string;
  name: string | null;
  city: string | null;
}

const norm = (v: string | null | undefined) =>
  (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export async function broadcastAudience(db: Db, accountId: string, f: BroadcastFilters): Promise<AudienceLead[]> {
  const rows = await db.execute(sql`
    SELECT l.id, l.conversation_id, c.phone_jid, coalesce(nullif(l.card_name, 'Lead'), c.lead_name) AS name,
           l.city, l.stage, l.column_id, l.funnel_id, l.seller_id, l.product_id, l.closed,
           c.last_message_at,
           EXISTS (SELECT 1 FROM messages mi WHERE mi.conversation_id = c.id AND mi.direction = 'IN') AS replied,
           coalesce((SELECT json_agg(lt.tag_id) FROM lead_tags lt WHERE lt.lead_id = l.id), '[]') AS tag_ids
      FROM leads l
      JOIN conversations c ON c.id = l.conversation_id
     WHERE l.account_id = ${accountId}
       AND c.channel = 'WHATSAPP'
       AND c.is_group = false
       AND c.phone_jid NOT LIKE '%@g.us'
       AND c.phone_jid NOT LIKE '%@broadcast'
       AND c.phone_jid NOT LIKE '%@newsletter'
       AND c.phone_jid NOT LIKE 'ig:%'
       AND c.phone_jid NOT LIKE 'fb:%'
  `);

  const cols = await db
    .select({ id: schema.funnelColumns.id, kind: schema.funnelColumns.kind, funnelId: schema.funnelColumns.funnelId })
    .from(schema.funnelColumns)
    .where(eq(schema.funnelColumns.accountId, accountId));
  const funnels = await db
    .select({ id: schema.funnels.id, isDefault: schema.funnels.isDefault })
    .from(schema.funnels)
    .where(eq(schema.funnels.accountId, accountId));
  const defaultFunnel = funnels.find((x) => x.isDefault)?.id || null;
  const cities = f.cities.map(norm).filter(Boolean);
  const since = f.activeDays ? Date.now() - f.activeDays * 864e5 : 0;

  const out: AudienceLead[] = [];
  const seen = new Set<string>();
  for (const r of rows.rows as Record<string, unknown>[]) {
    const stage = normalizeStage(String(r.stage));
    if (!f.includeClosed && (r.closed || stage === "SALE")) continue;
    if (f.onlyReplied && !r.replied) continue;
    if (since && (!r.last_message_at || new Date(r.last_message_at as string).getTime() < since)) continue;
    const tagIds = (typeof r.tag_ids === "string" ? JSON.parse(r.tag_ids) : r.tag_ids) as string[];
    if (f.tagIds.length && !f.tagIds.some((t) => tagIds.includes(t))) continue;
    if (f.excludeTagIds.some((t) => tagIds.includes(t))) continue;
    if (f.productIds.length && !f.productIds.includes(String(r.product_id))) continue;
    if (f.sellerIds.length) {
      const sid = r.seller_id ? String(r.seller_id) : "none";
      if (!f.sellerIds.includes(sid)) continue;
    }
    if (cities.length) {
      const c = norm(r.city as string | null);
      if (!c || !cities.some((x) => c.includes(x))) continue;
    }
    if (f.columnIds.length) {
      const funnelId = (r.funnel_id as string | null) || defaultFunnel;
      const col = r.column_id ? cols.find((c) => c.id === r.column_id) : cols.find((c) => c.funnelId === funnelId && c.kind === stage);
      if (!col || !f.columnIds.includes(col.id)) continue;
    }
    const jid = String(r.phone_jid);
    if (seen.has(jid)) continue;
    seen.add(jid);
    out.push({
      leadId: String(r.id),
      conversationId: String(r.conversation_id),
      phoneJid: jid,
      name: (r.name as string | null) || null,
      city: (r.city as string | null) || null,
    });
  }
  return out;
}
