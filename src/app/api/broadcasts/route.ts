export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { broadcastRecipients, broadcasts, driveFiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { broadcastAudience } from "@/lib/broadcast/shared";
import { broadcastValues } from "@/lib/broadcast/validate";

export async function GET() {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const rows = await db.query.broadcasts.findMany({
    where: eq(broadcasts.accountId, auth.accountId),
    orderBy: [desc(broadcasts.createdAt)],
    limit: 100,
  });
  return NextResponse.json({ broadcasts: rows });
}

/** Cria o disparo e congela a lista de destinatários (quem passa nos filtros agora) */
export async function POST(req: NextRequest) {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const parsed = broadcastValues(await req.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.values;
  if (v.driveFileId) {
    const file = await db.query.driveFiles.findFirst({ where: and(eq(driveFiles.id, v.driveFileId), eq(driveFiles.accountId, auth.accountId)) });
    if (!file) return NextResponse.json({ error: "Arquivo do Drive não encontrado" }, { status: 400 });
  }
  const audience = await broadcastAudience(db, auth.accountId, v.filters);
  if (!audience.length) return NextResponse.json({ error: "Nenhum lead passa nesses filtros" }, { status: 400 });

  const [created] = await db
    .insert(broadcasts)
    .values({
      ...v,
      accountId: auth.accountId,
      status: "SCHEDULED",
      total: audience.length,
      scheduledAt: v.scheduledAt || new Date(),
      nextAt: v.scheduledAt || new Date(),
      createdBy: auth.user.name,
    })
    .returning();
  for (let i = 0; i < audience.length; i += 500) {
    await db.insert(broadcastRecipients).values(
      audience.slice(i, i + 500).map((a) => ({
        broadcastId: created.id,
        accountId: auth.accountId,
        leadId: a.leadId,
        conversationId: a.conversationId,
        phoneJid: a.phoneJid,
        name: a.name,
        city: a.city,
      }))
    );
  }
  return NextResponse.json(created, { status: 201 });
}
