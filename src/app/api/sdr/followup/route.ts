export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings, followupSettings, tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { funnelsWithColumns } from "@/lib/funnel/shared";
import { followupCandidates, loadFollowup } from "@/lib/followup/shared";
import { followupValues } from "@/lib/followup/validate";
import { resolveAccountAiKey } from "@/lib/tenancy/server";

async function payload(accountId: string) {
  const [settings, funnels, tagRows, ai, key] = await Promise.all([
    loadFollowup(db, accountId),
    funnelsWithColumns(db, accountId),
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.accountId, accountId)),
    db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { enabled: true } }),
    resolveAccountAiKey(accountId),
  ]);
  // Fila: próximos envios (mesmo desligado, para mostrar quem entraria)
  const queue = (await followupCandidates(db, accountId, { ...settings, enabled: true })).slice(0, 30).map((c) => ({
    leadId: c.leadId,
    name: c.name,
    phone: c.phoneJid.split("@")[0],
    kind: c.next.kind,
    attempt: c.next.kind === "SEND" ? c.next.attempt + 1 : null,
    at: c.next.at,
    inBot: Boolean(c.botId),
  }));
  return {
    settings,
    funnels: funnels.map((f) => ({ id: f.id, name: f.name, columns: f.columns.map((c) => ({ id: c.id, name: c.name })) })),
    tags: tagRows,
    aiEnabled: Boolean(ai?.enabled),
    hasAiKey: Boolean(key.apiKey),
    queue,
  };
}

export async function GET() {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  return NextResponse.json(await payload(auth.accountId));
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const [funnels, tagRows] = await Promise.all([
    funnelsWithColumns(db, auth.accountId),
    db.select({ id: tags.id }).from(tags).where(eq(tags.accountId, auth.accountId)),
  ]);
  const parsed = followupValues(await req.json(), {
    tagIds: new Set(tagRows.map((t) => t.id)),
    columnIds: new Set(funnels.flatMap((f) => f.columns.map((c) => c.id))),
  });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await db
    .insert(followupSettings)
    .values({ id: auth.accountId, config: parsed.values, updatedAt: new Date() })
    .onConflictDoUpdate({ target: followupSettings.id, set: { config: parsed.values, updatedAt: new Date() } });
  return NextResponse.json(await payload(auth.accountId));
}
