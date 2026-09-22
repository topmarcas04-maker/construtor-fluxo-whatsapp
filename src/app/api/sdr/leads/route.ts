export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

/**
 * GET /api/sdr/leads
 * Lista os leads com conversa, última mensagem, vendedor, etiquetas e dados da IA.
 * Vendedores com vínculo veem só os leads deles.
 */
export async function GET() {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const onlySeller = auth.user.role === "SELLER" && auth.user.sellerId ? auth.user.sellerId : null;

  try {
    const all = await db.query.leads.findMany({
      where: onlySeller ? eq(leads.sellerId, onlySeller) : undefined,
      with: {
        conversation: {
          with: {
            messages: {
              orderBy: (m, { desc }) => [desc(m.sentAt)],
              limit: 1,
            },
          },
        },
        seller: true,
        leadTags: { with: { tag: true } },
      },
      orderBy: (l, { desc }) => [desc(l.updatedAt)],
    });

    const shaped = all
      .map((lead) => ({
        id: lead.id,
        conversationId: lead.conversationId,
        cardName: lead.cardName,
        stage: lead.stage,
        city: lead.city,
        phone: lead.phone,
        dealValue: lead.dealValue,
        closed: lead.closed,
        updatedAt: lead.updatedAt,
        createdAt: lead.createdAt,
        seller: lead.seller,
        tags: lead.leadTags.map((lt) => lt.tag),
        aiPaused: lead.aiPaused,
        aiSummary: lead.aiSummary,
        score: lead.score,
        interest: lead.interest,
        saleType: lead.saleType,
        note: lead.note,
        conversation: {
          phoneJid: lead.conversation.phoneJid,
          leadName: lead.conversation.leadName,
          lastMessageAt: lead.conversation.lastMessageAt,
        },
        lastMessage: lead.conversation.messages[0] || null,
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
