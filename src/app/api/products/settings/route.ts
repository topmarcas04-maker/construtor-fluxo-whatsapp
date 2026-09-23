export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

/** Liga/desliga o uso do catálogo pela IA */
export async function GET() {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId) });
  return NextResponse.json({ catalogEnabled: s ? s.catalogEnabled : true, aiEnabled: Boolean(s?.enabled) });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  if (!auth.user.canEditProducts) {
    return NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 });
  }
  const { catalogEnabled } = await req.json();
  await db
    .insert(aiSettings)
    .values({ id: auth.accountId, catalogEnabled: Boolean(catalogEnabled) })
    .onConflictDoUpdate({ target: aiSettings.id, set: { catalogEnabled: Boolean(catalogEnabled), updatedAt: new Date() } });
  return NextResponse.json({ catalogEnabled: Boolean(catalogEnabled) });
}
