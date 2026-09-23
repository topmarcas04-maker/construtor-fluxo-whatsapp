import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories, productImages, products } from "@/db/schema";

export { priceLabel } from "./format";

export const MAX_PRODUCT_IMAGES = 5;

/** Produtos da conta com categoria e os ids das fotos (sem o arquivo, que é carregado à parte) */
export async function listProducts(accountId: string) {
  const [cats, prods] = await Promise.all([
    db
      .select()
      .from(productCategories)
      .where(eq(productCategories.accountId, accountId))
      .orderBy(asc(productCategories.sort), asc(productCategories.name)),
    db
      .select()
      .from(products)
      .where(eq(products.accountId, accountId))
      .orderBy(asc(products.sort), asc(products.name)),
  ]);
  const ids = prods.map((p) => p.id);
  const imgs = ids.length
    ? await db
        .select({
          id: productImages.id,
          productId: productImages.productId,
          sort: productImages.sort,
          label: productImages.label,
          active: productImages.active,
          availability: productImages.availability,
          leadTimeDays: productImages.leadTimeDays,
        })
        .from(productImages)
        .where(inArray(productImages.productId, ids))
        .orderBy(asc(productImages.sort))
    : [];
  return {
    categories: cats,
    products: prods.map((p) => ({
      ...p,
      images: imgs.filter((i) => i.productId === p.id).map((i) => ({
          id: i.id,
          url: `/api/products/image/${i.id}`,
          label: i.label,
          active: i.active,
          availability: i.availability,
          leadTimeDays: i.leadTimeDays,
        })),
    })),
  };
}

export async function getOwnProduct(accountId: string, id: string) {
  return db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.accountId, accountId)) });
}

/** Valida e grava as fotos do produto (data URLs de imagem) */
export interface ImageInput {
  /** Foto que já existe (manter) */
  id?: string;
  /** Foto nova (data URL) */
  dataUrl?: string;
  label?: string | null;
  active?: boolean;
  availability?: string | null;
  leadTimeDays?: number | string | null;
}

function imageExtras(item: ImageInput) {
  const availability = item.availability === "READY" || item.availability === "ORDER" ? item.availability : null;
  const d = item.leadTimeDays === "" || item.leadTimeDays == null ? null : Math.round(Number(item.leadTimeDays));
  return {
    active: item.active !== false,
    availability,
    leadTimeDays: availability === "ORDER" && d != null && Number.isFinite(d) && d >= 0 && d <= 365 ? d : null,
  };
}

/** Salva as fotos na ordem enviada: mantém as com id, cria as novas, apaga as que sumiram */
export async function saveImages(productId: string, items: ImageInput[]) {
  const current = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
  const currentIds = new Set(current.map((c) => c.id));
  const keepIds = items.map((i) => i.id).filter((id): id is string => Boolean(id && currentIds.has(id)));
  const remove = current.map((c) => c.id).filter((id) => !keepIds.includes(id));
  if (remove.length) await db.delete(productImages).where(inArray(productImages.id, remove));
  let sort = 0;
  for (const item of items) {
    if (sort >= MAX_PRODUCT_IMAGES) break;
    const label = String(item.label || "").trim().slice(0, 60) || null;
    if (item.id && currentIds.has(item.id)) {
      await db
        .update(productImages)
        .set({ sort: sort++, label, ...imageExtras(item) })
        .where(and(eq(productImages.id, item.id), eq(productImages.productId, productId)));
    } else if (item.dataUrl && /^data:image\/(jpeg|png|webp);base64,/.test(item.dataUrl) && item.dataUrl.length <= 1_500_000) {
      await db.insert(productImages).values({ productId, dataUrl: item.dataUrl, label, sort: sort++, ...imageExtras(item) });
    }
  }
}

export async function replaceImages(productId: string, keepIds: string[], newDataUrls: string[]) {
  const current = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
  const remove = current.map((c) => c.id).filter((id) => !keepIds.includes(id));
  if (remove.length) await db.delete(productImages).where(inArray(productImages.id, remove));
  let sort = 0;
  for (const id of keepIds) {
    await db.update(productImages).set({ sort: sort++ }).where(and(eq(productImages.id, id), eq(productImages.productId, productId)));
  }
  for (const url of newDataUrls) {
    if (sort >= MAX_PRODUCT_IMAGES) break;
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(url) || url.length > 1_500_000) continue;
    await db.insert(productImages).values({ productId, dataUrl: url, sort: sort++ });
  }
}

