export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAgents } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { agentLimit, agentValues, agentsPayload, ownAgent } from "@/lib/agents/server";

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
  const limit = await agentLimit(auth.accountId);
  if (n >= limit) {
    return NextResponse.json(
      { error: `Seu plano permite ${limit} agente${limit > 1 ? "s" : ""} de IA. Para criar mais, fale com quem administra a sua conta.` },
      { status: 403 }
    );
  }
  let source: Record<string, unknown> = body;
  if (body.duplicateFrom) {
    const from = await ownAgent(auth.accountId, String(body.duplicateFrom));
    if (!from) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    source = { ...from, name: `${from.name} (cópia)`.slice(0, 80) };
  }
  const parsed = await agentValues(auth.accountId, source);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [created] = await db
    .insert(aiAgents)
    .values({ ...parsed.values, accountId: auth.accountId, isPrimary: false, sort: n })
    .returning({ id: aiAgents.id });
  return NextResponse.json({ id: created.id, ...(await agentsPayload(auth.accountId)) });
}
