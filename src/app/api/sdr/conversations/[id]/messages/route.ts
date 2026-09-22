export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { conversations, leads, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendWhatsappMessage } from "@/lib/services/whatsapp/engineClient";
import { requireUser } from "@/lib/auth/server";

/** GET — histórico da conversa */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.accountId, auth.accountId)),
    });
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    const all = await db.query.messages.findMany({
      where: eq(messages.conversationId, id),
      orderBy: (m, { asc }) => [asc(m.sentAt)],
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Falha ao carregar mensagens" }, { status: 500 });
  }
}

/**
 * POST — mensagem manual (vendedor/admin). Quando uma pessoa responde,
 * a IA para de responder esse lead (pode ser religada no painel).
 * Body: { text: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const { text } = await req.json();
    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Digite uma mensagem" }, { status: 400 });
    }

    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.accountId, auth.accountId)),
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    await db.update(leads).set({ aiPaused: true, updatedAt: new Date() }).where(eq(leads.conversationId, id));

    const result = await sendWhatsappMessage(auth.accountId, conversation.phoneJid, String(text), "HUMAN");
    if ("error" in result) {
      return NextResponse.json({ error: `Mensagem não enviada: ${result.error}` }, { status: 502 });
    }

    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Falha ao enviar mensagem" }, { status: 500 });
  }
}
