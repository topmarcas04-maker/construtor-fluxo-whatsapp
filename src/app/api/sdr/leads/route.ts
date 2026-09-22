export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db/client";

/**
 * GET /api/sdr/leads
 * Lista os leads (cards do SDR) com a conversa, última mensagem, vendedor e etiquetas.
 */
export async function GET() {
  try {
    const all = await db.query.leads.findMany({
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

    const shaped = all.map((lead) => ({
      id: lead.id,
      conversationId: lead.conversationId,
      cardName: lead.cardName,
      stage: lead.stage,
      city: lead.city,
      dealValue: lead.dealValue,
      closed: lead.closed,
      updatedAt: lead.updatedAt,
      seller: lead.seller,
      tags: lead.leadTags.map((lt) => lt.tag),
      conversation: {
        phoneJid: lead.conversation.phoneJid,
        leadName: lead.conversation.leadName,
        lastMessageAt: lead.conversation.lastMessageAt,
      },
      lastMessage: lead.conversation.messages[0] || null,
    }));

    return NextResponse.json(shaped);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
