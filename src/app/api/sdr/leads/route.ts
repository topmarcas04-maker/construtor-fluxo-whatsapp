export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, leads, messages } from "@/db/schema";
import { requireUser, sellerScope } from "@/lib/auth/server";

/**
 * GET /api/sdr/leads
 * Lista os leads com conversa, última mensagem, vendedor, etiquetas e dados da IA.
 * Vendedores com vínculo veem só os leads deles.
 */
export async function GET() {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const onlySeller = sellerScope(auth.user);

  try {
    const all = await db.query.leads.findMany({
      where: onlySeller
        ? and(eq(leads.accountId, auth.accountId), eq(leads.sellerId, onlySeller))
        : eq(leads.accountId, auth.accountId),
      with: {
        conversation: {
          with: {
            messages: {
              // Sem o arquivo (áudio/foto): a lista só precisa do texto da última mensagem
              columns: { id: true, body: true, direction: true, sentAt: true, messageType: true, sender: true },
              orderBy: (m, { desc }) => [desc(m.sentAt)],
              limit: 1,
            },
          },
        },
        seller: true,
        product: { columns: { id: true, name: true, kind: true } },
        leadTags: { with: { tag: true } },
      },
      orderBy: (l, { desc }) => [desc(l.updatedAt)],
    });

    // Mensagens do cliente que a equipe ainda não leu, por conversa
    const unreadRows = await db
      .select({
        conversationId: messages.conversationId,
        n: sql<number>`(count(*) - max(${conversations.readInCount}))::int`,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.accountId, auth.accountId), eq(messages.direction, "IN")))
      .groupBy(messages.conversationId);
    const unread = new Map(unreadRows.map((r) => [r.conversationId, Math.max(0, Number(r.n))]));

    const shaped = all
      .map((lead) => ({
        id: lead.id,
        conversationId: lead.conversationId,
        cardName: lead.cardName,
        stage: lead.stage,
        columnId: lead.columnId,
        funnelId: lead.funnelId,
        product: lead.product || null,
        lastAction: lead.lastAction,
        lastActionAt: lead.lastActionAt,
        city: lead.city,
        phone: lead.phone,
        dealValue: lead.dealValue,
        closed: lead.closed,
        updatedAt: lead.updatedAt,
        createdAt: lead.createdAt,
        seller: lead.seller,
        tags: lead.leadTags.map((lt) => lt.tag),
        aiPaused: lead.aiPaused,
        inBot: Boolean(lead.botId),
        aiSummary: lead.aiSummary,
        qualifyData: lead.qualifyData || null,
        score: lead.score,
        interest: lead.interest,
        saleType: lead.saleType,
        note: lead.note,
        conversation: {
          phoneJid: lead.conversation.phoneJid,
          channel: lead.conversation.channel,
          handle: lead.conversation.handle,
          leadName: lead.conversation.leadName,
          lastMessageAt: lead.conversation.lastMessageAt,
        },
        lastMessage: lead.conversation.messages[0] || null,
        unread: unread.get(lead.conversationId) || 0,
      }))
      // Conversa com mensagem mais recente primeiro
      .sort((a, b) => {
        const ta = new Date(a.conversation.lastMessageAt || a.updatedAt).getTime();
        const tb = new Date(b.conversation.lastMessageAt || b.updatedAt).getTime();
        return tb - ta;
      });

    return NextResponse.json(shaped);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json({ error: "Falha ao carregar leads" }, { status: 500 });
  }
}
