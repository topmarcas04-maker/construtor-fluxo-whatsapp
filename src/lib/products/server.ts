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
        .select({ id: productImages.id, productId: productImages.productId, sort: productImages.sort })
        .from(productImages)
        .where(inArray(productImages.productId, ids))
        .orderBy(asc(productImages.sort))
    : [];
  return {
    categories: cats,
    products: prods.map((p) => ({
      ...p,
      images: imgs.filter((i) => i.productId === p.id).map((i) => ({ id: i.id, url: `/api/products/image/${i.id}` })),
    })),
  };
}

export async function getOwnProduct(accountId: string, id: string) {
  return db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.accountId, accountId)) });
}

/** Valida e grava as fotos do produto (data URLs de imagem) */
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

