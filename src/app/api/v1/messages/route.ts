export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiError, normalizePhone, requireApiKey } from "@/lib/api/keys";
import { upsertLead, type LeadInput } from "@/lib/api/leads";
import { resolveWhatsappNumber, sendWhatsappMedia, sendWhatsappMessage } from "@/lib/services/whatsapp/engineClient";

const MAX_MEDIA = 8 * 1024 * 1024;

/**
 * POST /api/v1/messages — envia uma mensagem de WhatsApp pelo número conectado da conta.
 * { to, text?, mediaUrl?, caption?, fileName?, lead? }
 */
export async function POST(req: NextRequest) {
  const a = await requireApiKey(req);
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError(400, "Envie um JSON no corpo");
  const phone = normalizePhone(body.to);
  if (!phone) return apiError(400, 'Campo "to" inválido: use o número com DDD (ex.: 16999998888)');
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  if (!text && !mediaUrl) return apiError(400, 'Informe "text" ou "mediaUrl"');
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) return apiError(400, '"mediaUrl" precisa começar com http:// ou https://');

  // Número com WhatsApp (e o endereço certo, com ou sem o 9)
  const r = await resolveWhatsappNumber(a.accountId, phone);
  if ("error" in r) return apiError(502, r.error);
  if (r.exists === false) return apiError(422, "Este número não tem WhatsApp");
  const jid = r.jid || `${phone}@s.whatsapp.net`;

  let leadInfo: { id: string; created: boolean } | null = null;
  if (body.lead && typeof body.lead === "object") {
    const up = await upsertLead(a.accountId, jid, phone, body.lead as LeadInput);
    leadInfo = { id: up.lead.id, created: up.created };
  }

  const key = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, a.keyId), columns: { name: true } });
  const author = `API · ${key?.name || "integração"}`.slice(0, 150);

  if (mediaUrl) {
    let res: Response;
    try {
      res = await fetch(mediaUrl, { signal: AbortSignal.timeout(20000) });
    } catch {
      return apiError(400, "Não consegui baixar o arquivo do mediaUrl");
    }
    if (!res.ok) return apiError(400, `O mediaUrl respondeu ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_MEDIA) return apiError(400, "Arquivo vazio ou maior que 8 MB");
    const mime = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const isImage = /^image\/(jpeg|png|webp)$/.test(mime);
    const fileName =
      (typeof body.fileName === "string" && body.fileName.trim()) || decodeURIComponent(new URL(mediaUrl).pathname.split("/").pop() || "arquivo");
    const sent = await sendWhatsappMedia(
      a.accountId,
      jid,
      { kind: isImage ? "image" : "document", base64: buf.toString("base64"), mimetype: mime, fileName, caption: (body.caption || text || "").toString().slice(0, 1000) || null, sender: "AUTO" },
      null
    );
    if ("error" in sent) return apiError(502, sent.error);
    // Texto além da legenda (quando veio "caption" e "text")
    if (text && body.caption) {
      const t = await sendWhatsappMessage(a.accountId, jid, text, "AUTO", author);
      if ("error" in t) return apiError(502, t.error);
    }
  } else {
    const sent = await sendWhatsappMessage(a.accountId, jid, text, "AUTO", author);
    if ("error" in sent) return apiError(502, sent.error);
  }
  return NextResponse.json({ ok: true, to: jid.split("@")[0], lead: leadInfo });
}
