export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, aiSettings, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

/** GET — a IA desta conta está parada? Quantos clientes esperam resposta? (faixa vermelha do painel) */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const [acc, pending, st] = await Promise.all([
    db.query.accounts.findFirst({ where: eq(accounts.id, auth.accountId), columns: { aiError: true, aiErrorAt: true } }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.accountId, auth.accountId), isNotNull(leads.aiPendingAt))),
    db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId), columns: { pendingMaxHours: true } }),
  ]);
  return NextResponse.json({
    error: acc?.aiError || null,
    since: acc?.aiErrorAt || null,
    pending: Number(pending[0]?.n || 0),
    maxHours: st?.pendingMaxHours ?? 24,
  });
}
