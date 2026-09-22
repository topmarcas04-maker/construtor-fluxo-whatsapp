export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { getSubtreeIds } from "@/lib/tenancy/server";

/**
 * Árvore de contas visíveis para o usuário (a própria + todas abaixo).
 * Usada no seletor "visualizar como" e nos filtros da Visão Geral.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login novamente" }, { status: 401 });
  if (!user.canManage) return NextResponse.json({ home: user.homeAccount, accounts: [user.account] });
  const ids = await getSubtreeIds(user.homeAccount.id);
  const rows = await db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, parentId: accounts.parentId, active: accounts.active })
    .from(accounts)
    .where(inArray(accounts.id, ids));
  return NextResponse.json({ home: user.homeAccount, accounts: rows });
}
