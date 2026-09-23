export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messages, productImages } from "@/db/schema";
import { verifyFileSignature } from "@/lib/meta/graph";

/**
 * GET /api/public/file/{msg|img}/{id}?s=assinatura
 * Arquivos que a Meta baixa para entregar ao cliente no Instagram/Messenger.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  if ((kind !== "msg" && kind !== "img") || !verifyFileSignature(kind, id, req.nextUrl.searchParams.get("s"))) {
    return new NextResponse("não encontrado", { status: 404 });
  }
  let dataUrl: string | null | undefined;
  if (kind === "msg") {
    const row = await db.query.messages.findFirst({ where: eq(messages.id, id), columns: { mediaDataUrl: true } });
    dataUrl = row?.mediaDataUrl;
  } else {
    const row = await db.query.productImages.findFirst({ where: eq(productImages.id, id), columns: { dataUrl: true } });
    dataUrl = row?.dataUrl;
  }
  const m = dataUrl ? /^data:([^;,]+)[^,]*;base64,(.*)$/s.exec(dataUrl) : null;
  if (!m) return new NextResponse("não encontrado", { status: 404 });
  const buf = Buffer.from(m[2], "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": m[1], "Content-Length": String(buf.length), "Cache-Control": "private, max-age=3600" },
  });
}
