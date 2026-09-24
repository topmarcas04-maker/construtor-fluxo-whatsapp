export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productImages } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getOwnProduct, MAX_PRODUCT_IMAGES } from "@/lib/products/server";
import { validPhotoDataUrl } from "@/lib/products/photos";

/**
 * POST { productId, replace, photos: [{ label, dataUrl }] } — fotos vindas do .zip da importação.
 * replace = true apaga as fotos atuais antes (primeiro envio de cada produto).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) return NextResponse.json({ error: "Sem permissão para editar produtos" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const product = await getOwnProduct(auth.accountId, String(body.productId || ""));
  if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  const photos = (Array.isArray(body.photos) ? body.photos : []).filter((p: { dataUrl?: unknown }) => validPhotoDataUrl(p?.dataUrl)) as {
    label?: string | null;
    dataUrl: string;
  }[];
  if (body.replace === true) await db.delete(productImages).where(eq(productImages.productId, product.id));
  const current = await db.select({ id: productImages.id }).from(productImages).where(and(eq(productImages.productId, product.id)));
  let sort = current.length;
  let added = 0;
  for (const p of photos) {
    if (sort >= MAX_PRODUCT_IMAGES) break;
    await db.insert(productImages).values({
      productId: product.id,
      dataUrl: p.dataUrl,
      label: String(p.label || "").trim().slice(0, 60) || null,
      sort: sort++,
    });
    added++;
  }
  return NextResponse.json({ ok: true, added, skipped: photos.length - added });
}
