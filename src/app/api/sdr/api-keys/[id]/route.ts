export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

/** DELETE — apaga a chave (o sistema que usava para de funcionar na hora) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
