export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productImages, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["produtos", "leads"]);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db
    .select({ data: productImages.dataUrl })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.id, id), eq(products.accountId, auth.accountId)))
    .limit(1);
  const m = row ? /^data:([^;,]+);base64,(.+)$/.exec(row.data) : null;
  if (!m) return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
  const buf = Buffer.from(m[2], "base64");
  return new NextResponse(buf, {
    headers: { "Content-Type": m[1], "Content-Length": String(buf.length), "Cache-Control": "private, max-age=3600" },
  });
}
