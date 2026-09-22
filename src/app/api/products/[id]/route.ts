export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getOwnProduct, replaceImages } from "@/lib/products/server";
import { productValues } from "@/lib/products/validate";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!(await getOwnProduct(auth.accountId, id))) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  const body = await req.json();
  const parsed = productValues(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.values.categoryId) {
    const cat = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.id, parsed.values.categoryId as string), eq(productCategories.accountId, auth.accountId)),
    });
    if (!cat) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
  }
  const [updated] = await db
    .update(products)
    .set({ ...parsed.values, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (Array.isArray(body.keepImageIds) || Array.isArray(body.newImages)) {
    await replaceImages(id, Array.isArray(body.keepImageIds) ? body.keepImageIds : [], Array.isArray(body.newImages) ? body.newImages : []);
  }
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(products).where(and(eq(products.id, id), eq(products.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
