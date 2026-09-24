export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { buildProductSheet } from "@/lib/products/sheet";

/** GET — catálogo em planilha (.xlsx). ?modelo=1 devolve só o cabeçalho */
export async function GET(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  const empty = Boolean(req.nextUrl.searchParams.get("modelo"));
  const rows = empty
    ? []
    : await db
        .select({ p: products, category: productCategories.name })
        .from(products)
        .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
        .where(eq(products.accountId, auth.accountId))
        .orderBy(asc(products.sort), asc(products.name));
  const buf = await buildProductSheet(
    rows.map(({ p, category }) => ({
      code: p.code,
      name: p.name,
      category,
      kind: p.kind,
      price: p.price,
      promoPrice: p.promoPrice,
      installments: p.installments || [],
      availability: p.availability,
      leadTimeDays: p.leadTimeDays,
      description: p.description,
      active: p.active,
      billingPeriod: p.billingPeriod,
      setupFee: p.setupFee,
      commitmentMonths: p.commitmentMonths,
      trialDays: p.trialDays,
      durationMinutes: p.durationMinutes,
    }))
  );
  const name = empty ? "modelo-produtos.xlsx" : `produtos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
