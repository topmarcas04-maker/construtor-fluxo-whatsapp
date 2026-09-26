export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { agentsPayload } from "@/lib/agents/server";

/** Liga/desliga o atendimento automático da conta (todos os agentes). Corpo: { enabled: boolean } */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Informe enabled" }, { status: 400 });
  const exists = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId), columns: { id: true } });
  if (exists) {
    await db.update(aiSettings).set({ enabled: body.enabled, updatedAt: new Date() }).where(eq(aiSettings.id, auth.accountId));
  } else {
    await db.insert(aiSettings).values({ id: auth.accountId, enabled: body.enabled }).onConflictDoNothing();
  }
  return NextResponse.json(await agentsPayload(auth.accountId));
}
