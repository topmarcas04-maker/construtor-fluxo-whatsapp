export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { DEFAULT_PERMISSIONS } from "@/lib/auth/modules";

async function userCount() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(appUsers);
  return row?.n ?? 0;
}

/** GET: diz se o sistema ainda precisa do primeiro acesso (criar o Master) */
export async function GET() {
  try {
    return NextResponse.json({ needsSetup: (await userCount()) === 0 });
  } catch {
    return NextResponse.json({ needsSetup: false, error: "Banco indisponível" }, { status: 500 });
  }
}

/** POST: cria o primeiro usuário (Administrador Master). Só funciona com o sistema vazio. */
export async function POST(request: Request) {
  if ((await userCount()) > 0) {
    return NextResponse.json({ error: "O administrador já foi criado. Faça login." }, { status: 409 });
  }
  const { name, email, password } = await request.json();
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres" },
      { status: 400 }
    );
  }
  const [user] = await db
    .insert(appUsers)
    .values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      role: "MASTER",
      permissions: DEFAULT_PERMISSIONS.MASTER,
      lastLoginAt: new Date(),
    })
    .returning();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
  return res;
}
