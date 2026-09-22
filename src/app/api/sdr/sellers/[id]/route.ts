export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

/** PATCH — edita nome/telefone/ativo do vendedor */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json();
  const set: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim();
  if (body.phone !== undefined) set.phone = String(body.phone || "").replace(/\D/g, "") || null;
  if (typeof body.active === "boolean") set.active = body.active;
  const [updated] = await db.update(sellers).set(set).where(eq(sellers.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

/** DELETE — remove o vendedor (leads dele ficam sem vendedor) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(sellers).where(eq(sellers.id, id));
  return NextResponse.json({ ok: true });
}
