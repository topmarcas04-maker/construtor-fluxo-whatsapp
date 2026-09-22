export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { ACTING_COOKIE, getCurrentUser } from "@/lib/auth/server";
import { getAccount, isInSubtree } from "@/lib/tenancy/server";
import { sessionCookieOptions } from "@/lib/auth/session";

/**
 * POST { accountId } — administrador passa a visualizar o painel de uma conta abaixo dele.
 * POST { accountId: null } — volta para a própria conta.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login novamente" }, { status: 401 });
  const { accountId } = await request.json().catch(() => ({ accountId: null }));
  const res = NextResponse.json({ ok: true });

  if (!accountId || accountId === user.homeAccount.id) {
    res.cookies.set(ACTING_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  if (!user.canManage) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const target = await getAccount(accountId);
  if (!target || !(await isInSubtree(user.homeAccount.id, target.id))) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }
  res.cookies.set(ACTING_COOKIE, target.id, { ...sessionCookieOptions, maxAge: 60 * 60 * 12 });
  return res;
}
