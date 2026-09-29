export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { verifySsoToken } from "@/lib/auth/sso";

/**
 * POST { token } — o RossIA Partners avisa a situação: compra ativa (libera) ou atrasada/cancelada (bloqueia).
 * Só mexe em contas ligadas ao Partners (sso_ref) e nunca na conta Master.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const p = verifySsoToken(body.token);
  if (!p || (p.typ !== "status" && p.typ !== "renew")) return NextResponse.json({ error: "token inválido" }, { status: 401 });
  if (p.typ === "renew") return NextResponse.json({ ok: true, ignored: "renew" });
  const rows = await db
    .update(accounts)
    .set({ active: Boolean(p.active) })
    .where(and(eq(accounts.ssoRef, p.sub), ne(accounts.type, "MASTER")))
    .returning({ id: accounts.id });
  return NextResponse.json({ ok: true, updated: rows.length });
}
