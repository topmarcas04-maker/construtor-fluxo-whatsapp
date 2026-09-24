export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { normalizeSellerHours } from "@/lib/ai/hours";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json();
  const set: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim();
  if (body.phone !== undefined) set.phone = String(body.phone || "").replace(/\D/g, "") || null;
  if (typeof body.active === "boolean") set.active = body.active;
  if (body.shift !== undefined) set.shift = body.shift && typeof body.shift === "object" ? normalizeSellerHours(body.shift) : null;
  const [updated] = await db
    .update(sellers)
    .set(set)
    .where(and(eq(sellers.id, id), eq(sellers.accountId, auth.accountId)))
    .returning();
  if (!updated) return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(sellers).where(and(eq(sellers.id, id), eq(sellers.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
