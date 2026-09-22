export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { ACTING_COOKIE } from "@/lib/auth/server";
import { getAccount } from "@/lib/tenancy/server";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha" }, { status: 400 });
  }
  const user = await db.query.appUsers.findFirst({
    where: eq(appUsers.email, String(email).trim().toLowerCase()),
  });
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
  }
  if (!user.active) {
    return NextResponse.json({ error: "Usuário desativado. Fale com o administrador." }, { status: 403 });
  }
  const account = await getAccount(user.accountId);
  if (!account || !account.active) {
    return NextResponse.json({ error: "Esta conta está desativada. Fale com quem te cadastrou." }, { status: 403 });
  }
  await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, user.id));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
  res.cookies.set(ACTING_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
