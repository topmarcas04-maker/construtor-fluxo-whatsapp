export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { storageReady, signedUrl } from "@/lib/storage/s3";

/** Devolve o arquivo (áudio, foto, vídeo, documento) de uma mensagem da conta */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db
    .select({ data: messages.mediaDataUrl, key: messages.mediaKey, mime: messages.mediaMimeType, name: messages.mediaFileName })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, id), eq(conversations.accountId, auth.accountId)))
    .limit(1);
  // Vídeos ficam no bucket: abre por um link temporário
  if (row?.key && !row.data) {
    if (!storageReady()) return NextResponse.json({ error: "Armazenamento não configurado" }, { status: 404 });
    return NextResponse.redirect(await signedUrl(row.key, 3600), 302);
  }
  const m = row?.data ? /^data:([^;,]+)[^,]*,(.+)$/.exec(row.data) : null;
  if (!m) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const buf = Buffer.from(m[2], "base64");
  const headers: Record<string, string> = {
    "Content-Type": row!.mime || m[1],
    "Content-Length": String(buf.length),
    "Cache-Control": "private, max-age=86400",
  };
  if (row!.name) headers["Content-Disposition"] = `inline; filename="${encodeURIComponent(row!.name)}"`;
  return new NextResponse(buf, { headers });
}
