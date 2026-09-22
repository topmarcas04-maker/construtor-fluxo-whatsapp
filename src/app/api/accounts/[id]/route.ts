export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import type { AccountType } from "@/lib/auth/modules";
import { getAccountModules } from "@/lib/tenancy/server";
import { accountValues } from "../shared";

async function ownChild(parentId: string, id: string) {
  return db.query.accounts.findFirst({ where: and(eq(accounts.id, id), eq(accounts.parentId, parentId)) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const child = await ownChild(auth.accountId, id);
  if (!child) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const parent = await db.query.accounts.findFirst({ where: eq(accounts.id, auth.accountId) });
  const parsed = accountValues(await req.json(), {
    partial: true,
    childType: child.type as AccountType,
    parentModules: await getAccountModules(parent || null),
  });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [updated] = await db.update(accounts).set(parsed.values).where(eq(accounts.id, id)).returning();
  const { aiApiKeyEnc, ...rest } = updated;
  return NextResponse.json({ ...rest, hasOwnKey: Boolean(aiApiKeyEnc) });
}

/** Exclui a conta e TUDO dela (usuários, leads, conversas, agenda e as contas abaixo) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const child = await ownChild(auth.accountId, id);
  if (!child) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  await db.delete(accounts).where(eq(accounts.id, id));
  return NextResponse.json({ ok: true });
}
