import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, funnelColumns, funnels, leads, leadTags, tags } from "@/db/schema";

export interface LeadInput {
  name?: string | null;
  city?: string | null;
  note?: string | null;
  tags?: string[];
  /** Nome da coluna do funil */
  column?: string | null;
  /** false = IA pausada (a equipe responde) */
  ia?: boolean;
}

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Cria (ou atualiza) a conversa + lead de um número. Devolve o lead e se foi criado agora */
export async function upsertLead(accountId: string, phoneJid: string, phone: string, input: LeadInput) {
  const name = String(input.name || "").trim().slice(0, 200) || null;
  let conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
  });
  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({ accountId, phoneJid, leadName: name || "Lead", lastMessageAt: new Date() })
      .onConflictDoNothing()
      .returning();
    conv ||= await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
  } else if (name && (!conv.leadName || conv.leadName === "Lead")) {
    await db.update(conversations).set({ leadName: name }).where(eq(conversations.id, conv.id));
  }
  if (!conv) throw new Error("Não foi possível criar a conversa");

  const set: Record<string, unknown> = { updatedAt: new Date(), phone };
  if (name) set.cardName = name;
  if (input.city) set.city = String(input.city).slice(0, 120);
  if (input.note) set.note = String(input.note).slice(0, 5000);
  if (typeof input.ia === "boolean") set.aiPaused = !input.ia;
  if (input.column) {
    const cols = await db.select().from(funnelColumns).where(eq(funnelColumns.accountId, accountId));
    const col = cols.find((c) => norm(c.name) === norm(String(input.column)));
    if (col) {
      const f = col.funnelId ? await db.query.funnels.findFirst({ where: eq(funnels.id, col.funnelId) }) : null;
      set.columnId = col.id;
      set.funnelId = f && !f.isDefault ? f.id : null;
    }
  }

  let lead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conv.id) });
  const created = !lead;
  if (!lead) {
    [lead] = await db
      .insert(leads)
      .values({ accountId, conversationId: conv.id, cardName: name || "Lead", stage: "FIRST_CONTACT", ...set } as typeof leads.$inferInsert)
      .returning();
  } else {
    await db.update(leads).set(set).where(eq(leads.id, lead.id));
  }

  // Etiquetas pelo nome (cria as que não existem)
  const wanted = (input.tags || []).map((t) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (wanted.length) {
    const all = await db.select().from(tags).where(eq(tags.accountId, accountId));
    const ids: string[] = [];
    for (const w of wanted) {
      let t = all.find((x) => norm(x.name) === norm(w));
      if (!t) [t] = await db.insert(tags).values({ accountId, name: w, color: "blue" }).returning();
      ids.push(t.id);
    }
    const have = await db.select({ tagId: leadTags.tagId }).from(leadTags).where(and(eq(leadTags.leadId, lead.id), inArray(leadTags.tagId, ids)));
    for (const id of ids) if (!have.some((h) => h.tagId === id)) await db.insert(leadTags).values({ leadId: lead.id, tagId: id }).onConflictDoNothing();
  }
  return { lead, conversationId: conv.id, created };
}
