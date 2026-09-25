export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products, sellers, tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { funnelsWithColumns } from "@/lib/funnel/shared";

/** Opções dos filtros do disparo: etiquetas, colunas, produtos e vendedores */
export async function GET() {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const [tagRows, funnels, productRows, sellerRows] = await Promise.all([
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.accountId, auth.accountId)),
    funnelsWithColumns(db, auth.accountId),
    db.select({ id: products.id, name: products.name }).from(products).where(eq(products.accountId, auth.accountId)),
    db.select({ id: sellers.id, name: sellers.name }).from(sellers).where(eq(sellers.accountId, auth.accountId)),
  ]);
  return NextResponse.json({
    tags: tagRows,
    funnels: funnels.map((f) => ({ id: f.id, name: f.name, columns: f.columns.map((c) => ({ id: c.id, name: c.name })) })),
    products: productRows.sort((a, b) => a.name.localeCompare(b.name)),
    sellers: sellerRows,
    waState: auth.user.account.waState,
  });
}
