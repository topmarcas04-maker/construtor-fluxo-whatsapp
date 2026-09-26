export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireUser } from "@/lib/auth/server";
import { agentsPayload } from "@/lib/agents/server";
import { syncAgentFromTemplate } from "@/lib/agents/templates";
import { syncPrimaryToSettings } from "@/lib/agents/shared";
import { toProfile } from "@/lib/agents/common";

/** "Atualizar do modelo": traz as melhorias do modelo sem mexer em produtos, ações, palavras-chave e status */
export async function POST(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("agentes");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const r = await syncAgentFromTemplate(auth.accountId, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.agent.isPrimary) await syncPrimaryToSettings(db, auth.accountId, toProfile(r.agent as unknown as Record<string, unknown>));
  return NextResponse.json(await agentsPayload(auth.accountId));
}
