export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAgents } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { MAX_AGENTS_TOTAL, activeLimitError, agentValues, agentsPayload, ownAgent } from "@/lib/agents/server";
import { materializeTemplates, templatesFor } from "@/lib/agents/templates";

/** Agentes de IA da conta ativa */
export async function GET() {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  return NextResponse.json(await agentsPayload(auth.accountId));
}

/** Novo agente. Corpo: os campos do agente, ou { duplicateFrom: id } para copiar um existente */
export async function POST(req: NextRequest) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(aiAgents).where(eq(aiAgents.accountId, auth.accountId))) as { n: number }[];
  if (n >= MAX_AGENTS_TOTAL) {
    return NextResponse.json({ error: `A conta pode guardar até ${MAX_AGENTS_TOTAL} agentes. Exclua algum que não usa.` }, { status: 403 });
  }
  // Adicionar de novo um modelo liberado (a cópia chega desativada)
  if (body.fromTemplateId) {
    const ok = (await templatesFor(auth.accountId)).some((t) => t.id === String(body.fromTemplateId));
    if (!ok) return NextResponse.json({ error: "Modelo não liberado para a sua conta" }, { status: 403 });
    await materializeTemplates(auth.accountId, [String(body.fromTemplateId)]);
    return NextResponse.json(await agentsPayload(auth.accountId));
  }
  let source: Record<string, unknown> = body;
  if (body.duplicateFrom) {
    const from = await ownAgent(auth.accountId, String(body.duplicateFrom));
    if (!from) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    source = { ...from, name: `${from.name} (cópia)`.slice(0, 80) };
  }
  const parsed = await agentValues(auth.accountId, source);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // O limite do plano conta só os ativos: sem vaga, o agente novo nasce desativado
  const values = { ...parsed.values };
  if (values.active && (await activeLimitError(auth.accountId))) values.active = false;
  const [created] = await db
    .insert(aiAgents)
    .values({ ...values, accountId: auth.accountId, isPrimary: false, sort: n })
    .returning({ id: aiAgents.id });
  return NextResponse.json({ id: created.id, ...(await agentsPayload(auth.accountId)) });
}
