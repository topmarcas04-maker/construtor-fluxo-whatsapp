export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appointments, conversations, leads } from "@/db/schema";
import { requireUser, canResetTestLead } from "@/lib/auth/server";

/**
 * POST /api/sdr/leads/[id]/reset — zera um lead de TESTE.
 * Apaga a conversa inteira (mensagens, lead, etiquetas, histórico de agentes, estado de fluxo)
 * e os agendamentos do lead. A próxima mensagem desse número entra como um cliente novo.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canResetTestLead(auth.user)) {
    return NextResponse.json({ error: "Somente o administrador master pode resetar leads" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Lead inválido" }, { status: 400 });
  const lead = await db.query.leads.findFirst({ where: and(eq(leads.id, id), eq(leads.accountId, auth.accountId)) });
  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  await db.delete(appointments).where(and(eq(appointments.accountId, auth.accountId), eq(appointments.leadId, id)));
  // Apagar a conversa leva junto (cascade): mensagens, lead, etiquetas do lead, eventos de agente e estado do fluxo
  await db.delete(conversations).where(and(eq(conversations.id, lead.conversationId), eq(conversations.accountId, auth.accountId)));
  return NextResponse.json({ ok: true });
}
