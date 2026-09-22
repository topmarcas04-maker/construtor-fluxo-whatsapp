export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers, sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { userValues, publicUserColumns } from "./shared";

/** Usuários da conta ativa */
export async function GET() {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const all = await db.query.appUsers.findMany({
    where: eq(appUsers.accountId, auth.accountId),
    columns: publicUserColumns,
    with: { seller: true },
    orderBy: (u, { asc }) => asc(u.name),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const parsed = userValues(await req.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.values;
  if (v.role === "MASTER" && (auth.user.account.type !== "MASTER" || auth.user.role !== "MASTER")) {
    return NextResponse.json({ error: "Só o Master pode criar outro Master" }, { status: 403 });
  }
  if (v.sellerId) {
    const s = await db.query.sellers.findFirst({
      where: and(eq(sellers.id, v.sellerId as string), eq(sellers.accountId, auth.accountId)),
    });
    if (!s) return NextResponse.json({ error: "Vendedor inválido" }, { status: 400 });
  }
  const exists = await db.query.appUsers.findFirst({ where: eq(appUsers.email, v.email as string) });
  if (exists) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  const [created] = await db
    .insert(appUsers)
    .values({ ...(v as typeof appUsers.$inferInsert), accountId: auth.accountId })
    .returning({ id: appUsers.id });
  return NextResponse.json(created, { status: 201 });
}
