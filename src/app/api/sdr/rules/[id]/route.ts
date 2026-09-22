export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { distributionRules } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db
    .delete(distributionRules)
    .where(and(eq(distributionRules.id, id), eq(distributionRules.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
