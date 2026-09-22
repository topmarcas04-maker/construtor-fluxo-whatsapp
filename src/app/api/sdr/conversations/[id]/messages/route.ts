export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { conversations, leads, messages, products } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendWhatsappMedia, sendWhatsappMessage, sendWhatsappProduct } from "@/lib/services/whatsapp/engineClient";
import { requireUser } from "@/lib/auth/server";

/** Tamanho máximo de arquivo enviado pelo painel */
const MAX_UPLOAD = 8 * 1024 * 1024;

/** GET — histórico da conversa (a mídia é carregada à parte, em /api/sdr/media/[id]) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.accountId, auth.accountId)),
    });
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        direction: messages.direction,
        body: messages.body,
        messageType: messages.messageType,
        sentAt: messages.sentAt,
        sender: messages.sender,
        authorName: messages.authorName,
        mediaMimeType: messages.mediaMimeType,
        mediaFileName: messages.mediaFileName,
        hasMedia: sql<boolean>`(${messages.mediaDataUrl} is not null)`,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.sentAt);
    return NextResponse.json(
      rows.map(({ hasMedia, ...m }) => ({ ...m, mediaUrl: hasMedia ? `/api/sdr/media/${m.id}` : null }))
    );
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Falha ao carregar mensagens" }, { status: 500 });
  }
}

/**
 * POST — mensagem enviada pelo painel (vendedor/admin). Quando uma pessoa responde,
 * a IA para de responder esse lead (pode ser religada no painel).
 * Body: { text } ou { media: { kind: "image"|"audio"|"document", dataUrl, fileName? }, caption? } ou { productId }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.accountId, auth.accountId)),
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const author = auth.user.name;
    let result;
    if (body.productId) {
      const product = await db.query.products.findFirst({
        where: and(eq(products.id, String(body.productId)), eq(products.accountId, auth.accountId)),
      });
      if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
      await db.update(leads).set({ aiPaused: true, updatedAt: new Date() }).where(eq(leads.conversationId, id));
      result = await sendWhatsappProduct(auth.accountId, conversation.phoneJid, product.id, author);
    } else if (body.media) {
      const { kind, dataUrl, fileName } = body.media as { kind: string; dataUrl: string; fileName?: string };
      const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/.exec(String(dataUrl || ""));
      if (!["image", "audio", "document"].includes(kind) || !match) {
        return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
      }
      const base64 = match[2];
      if (base64.length * 0.75 > MAX_UPLOAD) {
        return NextResponse.json({ error: "Arquivo muito grande (máx. 8 MB)" }, { status: 400 });
      }
      await db.update(leads).set({ aiPaused: true, updatedAt: new Date() }).where(eq(leads.conversationId, id));
      result = await sendWhatsappMedia(
        auth.accountId,
        conversation.phoneJid,
        {
          kind: kind as "image" | "audio" | "document",
          base64,
          mimetype: match[1],
          fileName: fileName || null,
          caption: body.caption || null,
        },
        author
      );
    } else {
      const text = String(body.text || "");
      if (!text.trim()) return NextResponse.json({ error: "Digite uma mensagem" }, { status: 400 });
      await db.update(leads).set({ aiPaused: true, updatedAt: new Date() }).where(eq(leads.conversationId, id));
      result = await sendWhatsappMessage(auth.accountId, conversation.phoneJid, text, "HUMAN", author);
    }

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
