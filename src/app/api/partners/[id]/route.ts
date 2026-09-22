export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { partners } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { partnerValues } from "../shared";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const parsed = partnerValues(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [updated] = await db.update(partners).set(parsed.values).where(eq(partners.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(partners).where(eq(partners.id, id));
  return NextResponse.json({ ok: true });
}
