export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendWhatsappMessage } from "@/lib/services/whatsapp/engineClient";

/**
 * GET /api/sdr/conversations/[id]/messages — histórico da conversa
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const all = await db.query.messages.findMany({
      where: eq(messages.conversationId, id),
      orderBy: (m, { asc }) => [asc(m.sentAt)],
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

/**
 * POST /api/sdr/conversations/[id]/messages — envia mensagem manual (vendedor/master)
 * Body: { text: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { text } = await req.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "text é obrigatório" }, { status: 400 });
    }

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const result = await sendWhatsappMessage(conversation.phoneJid, text);

    if ("error" in result) {
      // Motor indisponível: ainda assim registra a mensagem no histórico,
      // marcando que não foi entregue de fato pelo WhatsApp.
      const [saved] = await db
        .insert(messages)
        .values({
          conversationId: id,
          direction: "OUT",
          body: text,
          messageType: "text",
        })
        .returning();
      return NextResponse.json(
        { message: saved, warning: result.error },
        { status: 202 }
      );
    }

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
