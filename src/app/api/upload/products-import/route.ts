export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories, productImages, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { productValues } from "@/lib/products/validate";
import { readProductSheet, rowToBody, parsePhotoLinks } from "@/lib/products/sheet";
import { photoFromUrl } from "@/lib/products/photos";
import { MAX_PRODUCT_IMAGES } from "@/lib/products/server";

/**
 * Importação de produtos por planilha. Corpo = o arquivo (.xlsx ou .csv).
 * ?mode=preview → só confere e mostra o que vai acontecer; ?mode=apply → grava.
 * Fica fora do proxy de login (arquivo grande); o login é conferido aqui.
 */
const MAX_FILE = 15 * 1024 * 1024;
const key = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export async function POST(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) {
    return NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 });
  }
  const apply = req.nextUrl.searchParams.get("mode") === "apply";
  const fileName = decodeURIComponent(req.headers.get("x-file-name") || "planilha.xlsx");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  if (buf.length > MAX_FILE) return NextResponse.json({ error: "Planilha muito grande (máximo 15 MB)" }, { status: 413 });

  const sheet = await readProductSheet(buf, /\.csv$/i.test(fileName));
  if ("error" in sheet) return NextResponse.json({ error: sheet.error }, { status: 400 });

  const [existing, cats] = await Promise.all([
    db.select({ id: products.id, code: products.code, name: products.name }).from(products).where(eq(products.accountId, auth.accountId)),
    db.select().from(productCategories).where(eq(productCategories.accountId, auth.accountId)),
  ]);
  const byCode = new Map(existing.filter((p) => p.code).map((p) => [key(p.code!), p]));
  const byName = new Map(existing.map((p) => [key(p.name), p]));
  const catByName = new Map(cats.map((c) => [key(c.name), c]));

  type Planned = {
    line: number;
    code: string | null;
    name: string;
    category: string | null;
    action: "create" | "update" | "error";
    error?: string;
    targetId?: string;
    values?: Record<string, unknown>;
    photos: { label: string | null; url: string }[];
  };
  const seen = new Set<string>();
  const planned: Planned[] = sheet.rows.map((row) => {
    const body = rowToBody(row);
    const base = { line: row.line, code: body.code, name: body.name, category: row.category?.trim() || null, photos: parsePhotoLinks(row.photos) };
    const parsed = productValues(body as unknown as Record<string, unknown>, false);
    if ("error" in parsed) return { ...base, action: "error" as const, error: parsed.error };
    const ident = body.code ? `c:${key(body.code)}` : `n:${key(body.name)}`;
    if (seen.has(ident)) return { ...base, action: "error" as const, error: "Produto repetido na planilha (mesmo código/nome)" };
    seen.add(ident);
    // Pelo código; senão pelo nome (produto ainda sem código ganha o código da planilha)
    const byN = byName.get(key(body.name));
    const target = (body.code && byCode.get(key(body.code))) || (byN && (!body.code || !byN.code) ? byN : undefined);
    return { ...base, action: target ? ("update" as const) : ("create" as const), targetId: target?.id, values: parsed.values };
  });

  const summary = {
    total: planned.length,
    create: planned.filter((p) => p.action === "create").length,
    update: planned.filter((p) => p.action === "update").length,
    errors: planned.filter((p) => p.action === "error").length,
    newCategories: [...new Set(planned.filter((p) => p.action !== "error" && p.category && !catByName.has(key(p.category))).map((p) => p.category!))],
    linkPhotos: planned.reduce((n, p) => n + (p.action !== "error" ? p.photos.length : 0), 0),
  };
  const rowsOut = planned.map(({ line, code, name, category, action, error, photos, targetId }) => ({
    line,
    code,
    name,
    category,
    action,
    error: error || null,
    linkPhotos: photos.length,
    id: targetId || null,
  }));
  if (!apply) return NextResponse.json({ summary, rows: rowsOut });

  // ----- Gravar -----
  let sort = existing.length;
  const photoErrors: string[] = [];
  for (const p of planned) {
    if (p.action === "error" || !p.values) continue;
    let categoryId: string | null | undefined = undefined;
    if (p.category) {
      let cat = catByName.get(key(p.category));
      if (!cat) {
        [cat] = await db
          .insert(productCategories)
          .values({ accountId: auth.accountId, name: p.category.slice(0, 120), sort: catByName.size })
          .returning();
        catByName.set(key(p.category), cat);
      }
      categoryId = cat.id;
    }
    const values = { ...p.values, ...(categoryId !== undefined ? { categoryId } : {}) };
    if (p.action === "update" && p.targetId) {
      await db
        .update(products)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(products.id, p.targetId), eq(products.accountId, auth.accountId)));
    } else {
      const [created] = await db
        .insert(products)
        .values({ ...(values as typeof products.$inferInsert), accountId: auth.accountId, sort: sort++ })
        .returning({ id: products.id });
      p.targetId = created.id;
    }
    // Fotos por link (substituem as atuais)
    if (p.photos.length && p.targetId) {
      const imgs: { label: string | null; dataUrl: string }[] = [];
      for (const ph of p.photos) {
        const r = await photoFromUrl(ph.url);
        if ("error" in r) photoErrors.push(`Linha ${p.line}: ${r.error}`);
        else imgs.push({ label: ph.label, dataUrl: r.dataUrl });
      }
      if (imgs.length) {
        await db.delete(productImages).where(eq(productImages.productId, p.targetId));
        await db.insert(productImages).values(
          imgs.slice(0, MAX_PRODUCT_IMAGES).map((im, i) => ({ productId: p.targetId!, dataUrl: im.dataUrl, label: im.label?.slice(0, 60) || null, sort: i }))
        );
      }
    }
  }
  const ids = planned.map((p) => p.targetId).filter((x): x is string => Boolean(x));
  const saved = ids.length
    ? await db.select({ id: products.id, code: products.code, name: products.name }).from(products).where(inArray(products.id, ids))
    : [];
  return NextResponse.json({ summary, rows: rowsOut, photoErrors, products: saved });
}
