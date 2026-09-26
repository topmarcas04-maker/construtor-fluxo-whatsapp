export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAgents } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { agentValues, agentsPayload, detachAgent, ownAgent } from "@/lib/agents/server";
import { syncPrimaryToSettings } from "@/lib/agents/shared";

type Ctx = { params: Promise<{ id: string }> };

/** Salva o agente. { makePrimary: true } torna ele o Agente Principal. */
export async function PATCH(req: NextRequest, c: Ctx) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const agent = await ownAgent(auth.accountId, id);
  if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  // Só ativar/desativar
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    if (agent.isPrimary && !body.active) return NextResponse.json({ error: "O Agente Principal não pode ser desativado" }, { status: 400 });
    await db.update(aiAgents).set({ active: body.active, updatedAt: new Date() }).where(eq(aiAgents.id, id));
    return NextResponse.json(await agentsPayload(auth.accountId));
  }

  const parsed = await agentValues(auth.accountId, { ...agent, ...body });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const makePrimary = body.makePrimary === true && !agent.isPrimary;
  const values = { ...parsed.values, updatedAt: new Date() };
  if (agent.isPrimary || makePrimary) values.active = true;
  await db.update(aiAgents).set({ ...values, ...(makePrimary ? { isPrimary: true } : {}) }).where(eq(aiAgents.id, id));
  if (makePrimary) {
    await db.update(aiAgents).set({ isPrimary: false }).where(and(eq(aiAgents.accountId, auth.accountId), ne(aiAgents.id, id)));
  }
  // O principal continua igual à tela Configurações → Agentes de IA
  if (agent.isPrimary || makePrimary) await syncPrimaryToSettings(db, auth.accountId, parsed.values);
  return NextResponse.json(await agentsPayload(auth.accountId));
}

export async function DELETE(_req: NextRequest, c: Ctx) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const agent = await ownAgent(auth.accountId, id);
  if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  if (agent.isPrimary) return NextResponse.json({ error: "O Agente Principal não pode ser excluído. Torne outro agente principal antes." }, { status: 400 });
  await detachAgent(auth.accountId, id);
  await db.delete(aiAgents).where(eq(aiAgents.id, id));
  return NextResponse.json(await agentsPayload(auth.accountId));
}
