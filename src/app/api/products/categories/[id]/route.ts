export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) {
    return NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const { name } = await req.json();
  const n = String(name || "").trim();
  if (!n) return NextResponse.json({ error: "Informe o nome da categoria" }, { status: 400 });
  const [updated] = await db
    .update(productCategories)
    .set({ name: n.slice(0, 120) })
    .where(and(eq(productCategories.id, id), eq(productCategories.accountId, auth.accountId)))
    .returning();
  return NextResponse.json(updated || { error: "Não encontrada" }, { status: updated ? 200 : 404 });
}

/** Exclui a categoria. Os produtos dela ficam "sem categoria". */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) {
    return NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 });
  }
  const { id } = await ctx.params;
  await db.delete(productCategories).where(and(eq(productCategories.id, id), eq(productCategories.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
