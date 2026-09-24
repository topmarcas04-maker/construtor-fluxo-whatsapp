export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { listWhatsappGroups } from "@/lib/services/whatsapp/engineClient";

/**
 * GET — grupos ligados no painel (última mensagem e não lidas).
 * GET ?all=1 — todos os grupos do número conectado, para escolher quais aparecem.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const mine = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.accountId, auth.accountId), eq(conversations.isGroup, true)));

  if (req.nextUrl.searchParams.get("all")) {
    const r = await listWhatsappGroups(auth.accountId);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json(
      r.groups.map((g) => ({ ...g, enabled: Boolean(mine.find((c) => c.phoneJid === g.jid)?.groupEnabled) }))
    );
  }

  const enabled = mine.filter((c) => c.groupEnabled);
  if (!enabled.length) return NextResponse.json([]);
  const ids = enabled.map((c) => c.id);
  const [last, counts] = await Promise.all([
    db.execute(sql`
      SELECT DISTINCT ON (conversation_id) conversation_id, id, body, direction, sent_at, sender, author_name
        FROM messages WHERE conversation_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
       ORDER BY conversation_id, sent_at DESC`),
    db
      .select({ conversationId: messages.conversationId, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(sql`${messages.conversationId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`, eq(messages.direction, "IN")))
      .groupBy(messages.conversationId),
  ]);
  const lastBy = new Map((last.rows as Record<string, unknown>[]).map((r) => [String(r.conversation_id), r]));
  const out = enabled
    .map((c) => {
      const m = lastBy.get(c.id);
      const inCount = Number(counts.find((x) => x.conversationId === c.id)?.n || 0);
      return {
        id: c.id,
        jid: c.phoneJid,
        name: c.leadName || "Grupo",
        lastMessageAt: c.lastMessageAt,
        unread: Math.max(0, inCount - c.readInCount),
        lastMessage: m
          ? { body: String(m.body || ""), direction: String(m.direction), authorName: (m.author_name as string) || null, sender: (m.sender as string) || null }
          : null,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
  return NextResponse.json(out);
}

/** PUT { jid, name, enabled } — liga/desliga um grupo no painel */
export async function PUT(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const body = await req.json();
  const jid = String(body.jid || "");
  if (!/^[\d-]+@g\.us$/.test(jid)) return NextResponse.json({ error: "Grupo inválido" }, { status: 400 });
  const name = String(body.name || "Grupo").slice(0, 150);
  const enabled = body.enabled === true;
  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, auth.accountId), eq(conversations.phoneJid, jid)),
  });
  if (existing) {
    await db
      .update(conversations)
      .set({ isGroup: true, groupEnabled: enabled, leadName: name })
      .where(eq(conversations.id, existing.id));
  } else if (enabled) {
    await db.insert(conversations).values({
      accountId: auth.accountId,
      phoneJid: jid,
      leadName: name,
      isGroup: true,
      groupEnabled: true,
      lastMessageAt: new Date(),
    } as typeof conversations.$inferInsert);
  }
  return NextResponse.json({ ok: true });
}
