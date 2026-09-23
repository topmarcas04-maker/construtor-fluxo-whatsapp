export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { aiActions } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureActions } from "@/lib/actions/shared";
import { actionValues } from "@/lib/actions/validate";

/** GET — ações da IA da conta (cria as padrão na primeira vez) */
export async function GET() {
  const auth = await requireUser(["configuracoes", "produtos"]);
  if (auth.error) return auth.error;
  return NextResponse.json(await ensureActions(db, auth.accountId));
}

/** POST — nova ação */
export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const parsed = actionValues(await req.json(), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const current = await ensureActions(db, auth.accountId);
  if (current.length >= 30) return NextResponse.json({ error: "Máximo de 30 ações." }, { status: 400 });
  await db.insert(aiActions).values({
    ...(parsed.values as typeof aiActions.$inferInsert),
    accountId: auth.accountId,
    sort: current.length,
  });
  return NextResponse.json(await ensureActions(db, auth.accountId));
}
