export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { userValues } from "../shared";

async function otherActiveAdmins(accountId: string, id: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.accountId, accountId),
        sql`${appUsers.role} IN ('MASTER','ADMIN')`,
        eq(appUsers.active, true),
        ne(appUsers.id, id)
      )
    );
  return row?.n ?? 0;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const target = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.id, id), eq(appUsers.accountId, auth.accountId)),
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const parsed = userValues(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.values;

  if ((target.role === "MASTER" || v.role === "MASTER") && auth.user.role !== "MASTER") {
    return NextResponse.json({ error: "Só o Master pode alterar um Master" }, { status: 403 });
  }
  if (v.role === "MASTER" && auth.user.account.type !== "MASTER") {
    return NextResponse.json({ error: "Perfil Master só existe na conta Master" }, { status: 400 });
  }
  const wasAdmin = target.role === "MASTER" || target.role === "ADMIN";
  const losingAdmin = wasAdmin && ((v.role && v.role === "SELLER") || v.active === false);
  if (losingAdmin && (await otherActiveAdmins(auth.accountId, id)) === 0) {
    return NextResponse.json({ error: "Precisa existir pelo menos um administrador ativo" }, { status: 400 });
  }
  if (v.email && v.email !== target.email) {
    const exists = await db.query.appUsers.findFirst({ where: eq(appUsers.email, v.email as string) });
    if (exists) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  }

  await db.update(appUsers).set(v).where(eq(appUsers.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (id === auth.user.id) {
    return NextResponse.json({ error: "Você não pode excluir o próprio usuário" }, { status: 400 });
  }
  const target = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.id, id), eq(appUsers.accountId, auth.accountId)),
  });
  if (!target) return NextResponse.json({ ok: true });
  if (target.role === "MASTER" && auth.user.role !== "MASTER") {
    return NextResponse.json({ error: "Só o Master pode excluir um Master" }, { status: 403 });
  }
  if ((target.role === "MASTER" || target.role === "ADMIN") && (await otherActiveAdmins(auth.accountId, id)) === 0) {
    return NextResponse.json({ error: "Precisa existir pelo menos um administrador ativo" }, { status: 400 });
  }
  await db.delete(appUsers).where(eq(appUsers.id, id));
  return NextResponse.json({ ok: true });
}
