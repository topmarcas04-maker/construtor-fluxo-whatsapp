export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funnels, products, sellers, waNumbers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { normalizeWaConfig, type WaNumberConfig } from "@/lib/whatsapp/config";
import { allowedSlots, slotFrom } from "@/lib/whatsapp/numbers";

async function options(accountId: string) {
  const [prods, sells, funs] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, active: products.active })
      .from(products)
      .where(eq(products.accountId, accountId))
      .orderBy(asc(products.sort), asc(products.name)),
    db.select({ id: sellers.id, name: sellers.name, active: sellers.active }).from(sellers).where(eq(sellers.accountId, accountId)).orderBy(asc(sellers.name)),
    db.select({ id: funnels.id, name: funnels.name, isDefault: funnels.isDefault }).from(funnels).where(eq(funnels.accountId, accountId)),
  ]);
  return { products: prods, sellers: sells, funnels: funs };
}

/** Regras de cada WhatsApp da conta + listas para escolher (produtos, vendedores, funis) */
export async function GET() {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  const rows = await db.select({ slot: waNumbers.slot, config: waNumbers.config }).from(waNumbers).where(eq(waNumbers.accountId, auth.accountId));
  const configs: Record<number, WaNumberConfig> = {};
  for (const n of [1, 2, 3]) configs[n] = normalizeWaConfig(rows.find((r) => r.slot === n)?.config);
  return NextResponse.json({ configs, maxWhatsapp: await allowedSlots(auth.accountId), ...(await options(auth.accountId)) });
}

/** Salva as regras de um número. Corpo: { slot, config } */
export async function PUT(req: Request) {
  const auth = await requireUser("whatsapp");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const slot = slotFrom(body?.slot);
  if (slot > (await allowedSlots(auth.accountId))) return NextResponse.json({ error: "Número não liberado para esta conta" }, { status: 403 });
  const raw = normalizeWaConfig(body?.config);
  // Só ids desta conta
  const opt = await options(auth.accountId);
  const has = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const pIds = has(opt.products);
  const sIds = has(opt.sellers);
  const funnel = opt.funnels.find((f) => f.id === raw.funnelId);
  const config: WaNumberConfig = {
    productIds: raw.productIds.filter((id) => pIds.has(id)),
    sellerIds: raw.sellerIds.filter((id) => sIds.has(id)),
    funnelId: funnel && !funnel.isDefault ? funnel.id : null,
    aiInstructions: raw.aiInstructions,
  };
  const found = await db.query.waNumbers.findFirst({ where: and(eq(waNumbers.accountId, auth.accountId), eq(waNumbers.slot, slot)) });
  if (found) await db.update(waNumbers).set({ config }).where(eq(waNumbers.id, found.id));
  else await db.insert(waNumbers).values({ accountId: auth.accountId, slot, config });
  return NextResponse.json({ ok: true, config });
}
