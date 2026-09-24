/**
 * Catálogo que a IA recebe (produtos ativos, cores ligadas, parcelas, ações). Sem imports "@/":
 * usado pelo motor e pela tela de teste da IA.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { products, productCategories, productImages } from "../../db/schema";
import type { AiAction } from "../actions/common";
import {
  installmentRows,
  installmentText,
  effectiveAvailability,
  availabilityText,
  kindPriceLabel,
  kindDetails,
  KIND_LABEL,
} from "../products/format";

type Db = NodePgDatabase<typeof schema>;

/** Ações do produto (as dele; senão as da categoria), com a principal primeiro */
export function productActionNames(
  r: { actionIds: string[]; primaryActionId: string | null; catActionIds: string[] | null; catPrimaryActionId: string | null },
  actions: AiAction[]
) {
  const own = (r.actionIds || []).length > 0;
  const ids = own ? r.actionIds : r.catActionIds || [];
  const primary = own ? r.primaryActionId : r.catPrimaryActionId;
  const list = ids.map((id) => actions.find((a) => a.id === id)).filter((a): a is AiAction => Boolean(a));
  list.sort((a, b) => (a.id === primary ? -1 : b.id === primary ? 1 : 0));
  return list.map((a) => a.name);
}

const CATALOG_LIMIT = 80;

export async function loadCatalogFor(db: Db, accountId: string, actions: AiAction[] = []) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      promoPrice: products.promoPrice,
      availability: products.availability,
      leadTimeDays: products.leadTimeDays,
      installments: products.installments,
      kind: products.kind,
      billingPeriod: products.billingPeriod,
      setupFee: products.setupFee,
      commitmentMonths: products.commitmentMonths,
      trialDays: products.trialDays,
      durationMinutes: products.durationMinutes,
      actionIds: products.actionIds,
      primaryActionId: products.primaryActionId,
      videoKey: products.videoKey,
      catActionIds: productCategories.actionIds,
      catFunnelId: productCategories.funnelId,
      catPrimaryActionId: productCategories.primaryActionId,
      category: productCategories.name,
    })
    .from(products)
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(and(eq(products.accountId, accountId), eq(products.active, true)))
    .orderBy(products.sort, products.name)
    .limit(CATALOG_LIMIT);
  if (!rows.length) return [];
  const photos = await db
    .select({
      productId: productImages.productId,
      label: productImages.label,
      active: productImages.active,
      availability: productImages.availability,
      leadTimeDays: productImages.leadTimeDays,
    })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(productImages.sort);
  // Cores desligadas não entram para a IA
  const activePhotos = photos.filter((ph) => ph.active !== false);
  const withPhoto = new Set(activePhotos.map((r) => r.productId));
  return rows.map((r, i) => ({
    id: r.id,
    funnelId: r.catFunnelId,
    ai: {
      code: `P${i + 1}`,
      name: r.name,
      category: r.category,
      price: kindPriceLabel(r),
      kind: KIND_LABEL[r.kind] || "Produto",
      actions: productActionNames(r, actions),
      details: kindDetails(r),
      description: r.description ? r.description.replace(/\s+/g, " ").slice(0, 400) : null,
      hasPhoto: withPhoto.has(r.id),
      hasVideo: Boolean(r.videoKey),
      photoLabels: activePhotos.filter((ph) => ph.productId === r.id && ph.label?.trim()).map((ph) => ph.label!.trim()),
      delivery: r.kind === "PHYSICAL" ? availabilityText(effectiveAvailability(r)) : undefined,
      installments: r.kind === "PHYSICAL" ? installmentRows(r).map(installmentText) : [],
      colors: activePhotos
        .filter((ph) => ph.productId === r.id && ph.label?.trim())
        .map((ph) => ({
          name: ph.label!.trim(),
          delivery: r.kind === "PHYSICAL" ? availabilityText(effectiveAvailability(r, ph)) : "",
        })),
    },
  }));
}

