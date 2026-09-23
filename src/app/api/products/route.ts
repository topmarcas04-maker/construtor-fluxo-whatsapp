export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { listProducts, replaceImages, saveImages } from "@/lib/products/server";
import { productValues } from "@/lib/products/validate";

/** Catálogo da conta. Quem atende (Leads) também pode ver, para enviar ao cliente. */
export async function GET() {
  const auth = await requireUser(["produtos", "leads"]);
  if (auth.error) return auth.error;
  return NextResponse.json(await listProducts(auth.accountId));
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) {
    return NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 });
  }
  const body = await req.json();
  const parsed = productValues(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.values.categoryId) {
    const cat = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.id, parsed.values.categoryId as string), eq(productCategories.accountId, auth.accountId)),
    });
    if (!cat) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
  }
  const [created] = await db
    .insert(products)
    .values({ ...(parsed.values as typeof products.$inferInsert), accountId: auth.accountId })
    .returning();
  if (Array.isArray(body.images)) await saveImages(created.id, body.images);
  else await replaceImages(created.id, [], Array.isArray(body.newImages) ? body.newImages : []);
  return NextResponse.json(created, { status: 201 });
}
