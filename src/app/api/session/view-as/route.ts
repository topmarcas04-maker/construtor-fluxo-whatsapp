export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { VIEW_AS_COOKIE, getCurrentUser } from "@/lib/auth/server";
import { sessionCookieOptions } from "@/lib/auth/session";

/**
 * POST { userId } — administrador da conta de parceiro passa a ver o painel como um vendedor (somente leitura).
 * POST { userId: null } — volta a ser administrador.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login novamente" }, { status: 401 });
  const { userId } = await request.json().catch(() => ({ userId: null }));
  const res = NextResponse.json({ ok: true });
  if (!userId) {
    res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  if (user.viewingAs || !user.canManage) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (user.account.type !== "PARTNER") {
    return NextResponse.json({ error: "Ver como vendedor está disponível nas contas de parceiro" }, { status: 403 });
  }
  const target = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.id, String(userId)), eq(appUsers.accountId, user.account.id)),
  });
  if (!target || target.role !== "SELLER" || !target.active) {
    return NextResponse.json({ error: "Vendedor não encontrado ou desativado" }, { status: 404 });
  }
  res.cookies.set(VIEW_AS_COOKIE, target.id, { ...sessionCookieOptions, maxAge: 60 * 60 * 12 });
  return res;
}
