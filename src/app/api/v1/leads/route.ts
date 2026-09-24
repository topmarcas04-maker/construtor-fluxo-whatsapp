export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { apiError, normalizePhone, requireApiKey } from "@/lib/api/keys";
import { upsertLead, type LeadInput } from "@/lib/api/leads";
import { resolveWhatsappNumber } from "@/lib/services/whatsapp/engineClient";

/**
 * POST /api/v1/leads — cria ou atualiza um lead (aparece em Leads/Funil).
 * { phone, name?, city?, note?, tags?: string[], column?: "Nome da coluna", ia?: boolean }
 */
export async function POST(req: NextRequest) {
  const a = await requireApiKey(req);
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError(400, "Envie um JSON no corpo");
  const phone = normalizePhone(body.phone);
  if (!phone) return apiError(400, 'Campo "phone" inválido: use o número com DDD (ex.: 16999998888)');
  const r = await resolveWhatsappNumber(a.accountId, phone);
  const jid = (!("error" in r) && r.jid) || `${phone}@s.whatsapp.net`;
  const up = await upsertLead(a.accountId, jid, phone, body as LeadInput);
  return NextResponse.json({ ok: true, id: up.lead.id, created: up.created }, { status: up.created ? 201 : 200 });
}
