export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { generateKey } from "@/lib/api/keys";

/** Chaves de API da conta (sem a chave em si, que só aparece ao criar) */
export async function GET() {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const rows = await db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.accountId, auth.accountId))
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json(rows);
}

/** POST { name } — cria uma chave e devolve ela UMA vez */
export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  if (!auth.user.canManage) {
    return NextResponse.json({ error: "Só administradores criam chaves de API" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 80) || "Integração";
  const count = (await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.accountId, auth.accountId))).length;
  if (count >= 20) return NextResponse.json({ error: "Máximo de 20 chaves por conta" }, { status: 400 });
  const k = generateKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ accountId: auth.accountId, name, prefix: k.prefix, keyHash: k.hash })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });
  return NextResponse.json({ ...row, key: k.key }, { status: 201 });
}
