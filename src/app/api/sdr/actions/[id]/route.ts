export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiActions } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureActions } from "@/lib/actions/shared";
import { actionValues } from "@/lib/actions/validate";

async function own(accountId: string, id: string) {
  return db.query.aiActions.findFirst({ where: and(eq(aiActions.id, id), eq(aiActions.accountId, accountId)) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!(await own(auth.accountId, id))) return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  const parsed = actionValues(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.values).length) await db.update(aiActions).set(parsed.values).where(eq(aiActions.id, id));
  return NextResponse.json(await ensureActions(db, auth.accountId));
}

/** DELETE — some dos produtos/categorias automaticamente (ids desconhecidos são ignorados) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!(await own(auth.accountId, id))) return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  await db.delete(aiActions).where(eq(aiActions.id, id));
  return NextResponse.json(await ensureActions(db, auth.accountId));
}
