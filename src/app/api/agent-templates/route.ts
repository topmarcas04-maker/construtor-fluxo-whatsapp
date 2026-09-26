export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { agentTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { allTemplates, isMasterUser, templatePayload, templateValues, templatesFor } from "@/lib/agents/templates";

/**
 * GET — Master: todos os modelos (para editar). Demais: os liberados para a conta (para repassar aos clientes).
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (isMasterUser(auth.user)) return NextResponse.json({ canManage: true, templates: templatePayload(await allTemplates()) });
  return NextResponse.json({ canManage: false, templates: templatePayload(await templatesFor(auth.accountId)) });
}

/** POST — novo modelo (só o Master) */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!isMasterUser(auth.user)) return NextResponse.json({ error: "Só o Master cria modelos" }, { status: 403 });
  const parsed = await templateValues(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const all = await allTemplates();
  const [created] = await db.insert(agentTemplates).values({ ...parsed.values, sort: all.length }).returning({ id: agentTemplates.id });
  return NextResponse.json({ id: created.id, canManage: true, templates: templatePayload(await allTemplates()) });
}
