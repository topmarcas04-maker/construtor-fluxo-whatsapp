export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings, appointments, distributionRules, productImages, products, tags } from "@/db/schema";
import { pickProductImage, productCaption } from "@/lib/products/format";
import { formatSpDate, formatSpTime } from "@/lib/time";
import { requireUser } from "@/lib/auth/server";
import { resolveAccountAiKey, getAccount } from "@/lib/tenancy/server";
import { runSdrAgent } from "@/lib/ai/sdrAgent";
import { loadCatalogFor } from "@/lib/ai/catalog";
import { ensureActions } from "@/lib/actions/shared";
import { ensureFunnels, ensureColumns } from "@/lib/funnel/shared";
import { storageReady } from "@/lib/storage/s3";
import { normalizeSellerHours, sellerAvailability, DEFAULT_AFTER_HOURS } from "@/lib/ai/hours";
import { normalizeQualify, qualifyPending, isQualified, maskCatalogItem } from "@/lib/ai/qualify";

/**
 * POST — conversa de teste com a IA (nada é salvo nem enviado).
 * Body: { messages: [{ from: "lead" | "ai", text }], draft?: { systemPrompt, style, styleCustom, replyLength, emojiLevel, replySpeed, model, offerVideo } }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const body = await req.json();
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-30) as { from: string; text: string }[];
  if (!msgs.length || msgs[msgs.length - 1].from !== "lead") return NextResponse.json({ error: "Escreva uma mensagem" }, { status: 400 });

  const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId) });
  if (!settings) return NextResponse.json({ error: "Configure a IA primeiro" }, { status: 400 });
  const key = await resolveAccountAiKey(auth.accountId);
  if (!key.apiKey) return NextResponse.json({ error: "Esta conta está sem chave de IA" }, { status: 400 });
  const draft = (body.draft || {}) as Record<string, string | undefined>;
  const offerVideo = typeof body.draft?.offerVideo === "boolean" ? (body.draft.offerVideo as boolean) : settings.offerVideo;

  const [tagRows, rules, allActions, funnelList, account] = await Promise.all([
    db.select({ name: tags.name }).from(tags).where(eq(tags.accountId, auth.accountId)),
    db.select().from(distributionRules).where(eq(distributionRules.accountId, auth.accountId)),
    ensureActions(db, auth.accountId),
    ensureFunnels(db, auth.accountId),
    getAccount(auth.accountId),
  ]);
  const actions = allActions.filter((a) => a.active);
  const catalog = settings.catalogEnabled ? await loadCatalogFor(db, auth.accountId, actions) : [];
  if (!storageReady()) for (const c of catalog) c.ai.hasVideo = false;
  const columns = (await Promise.all(funnelList.map((f) => ensureColumns(db, auth.accountId, f.id)))).flat();
  const ruleColumns = columns.filter((c) => c.kind === "CUSTOM" && c.aiRule?.trim());
  // Horários já ocupados (igual ao WhatsApp)
  const now = new Date();
  const busyRows = await db
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.accountId, auth.accountId),
        eq(appointments.status, "SCHEDULED"),
        gte(appointments.startsAt, now),
        lt(appointments.startsAt, new Date(now.getTime() + 21 * 864e5))
      )
    )
    .orderBy(appointments.startsAt)
    .limit(40);
  const model = (typeof draft.model === "string" && draft.model.trim()) || settings.model || "claude-sonnet-4-5";

  // Mensagem automática que iria depois da resposta (no horário ou fora dele)
  const handoffPreview = () => {
    const base = String(draft.handoffMessage ?? settings.handoffMessage ?? "");
    if (!base.trim()) return null;
    const avail = sellerAvailability(normalizeSellerHours(body.draft?.sellerHours ?? settings.sellerHours));
    const t = avail.open ? base : String(draft.afterHoursMessage ?? settings.afterHoursMessage ?? "").trim() || DEFAULT_AFTER_HOURS;
    return t
      .replace(/\{vendedor\}\s*,?\s*nosso consultor\s*,?/i, "um de nossos consultores,")
      .replace(/\{vendedor\}/g, "um de nossos consultores")
      .replace(/\{horario\}/g, avail.hoursText || "")
      .replace(/\{retorno\}/g, avail.nextOpen || "");
  };

  try {
    // Qualificação "Antes de informar": o teste guarda se o cliente já informou (body.qualified)
    const qualify = normalizeQualify(body.draft?.qualify ?? settings.qualify);
    const leadTexts = msgs.filter((m) => m.from === "lead").map((m) => String(m.text || ""));
    const pending = qualifyPending(qualify, { qualifiedAt: body.qualified ? new Date() : null, leadMessages: leadTexts.length });
    const input = (locked: boolean): Parameters<typeof runSdrAgent>[0] => ({
        systemPrompt: (draft.systemPrompt ?? settings.systemPrompt) || `Você é a atendente virtual da ${account?.name || "empresa"}.`,
        style: {
          style: draft.style ?? settings.style,
          styleCustom: draft.styleCustom ?? settings.styleCustom,
          replyLength: draft.replyLength ?? settings.replyLength,
          emojiLevel: draft.emojiLevel ?? settings.emojiLevel,
        },
        lead: { name: null, city: null, interest: null, saleType: "ANY", stage: "FIRST_CONTACT", score: null, summary: null },
        channel: "WHATSAPP",
        history: msgs.map((m) => ({ direction: m.from === "lead" ? "IN" : "OUT", body: String(m.text || "").slice(0, 2000), sender: m.from === "lead" ? "LEAD" : "AI" })),
        tags: tagRows.map((t) => t.name),
        regions: [...new Set(rules.filter((r) => r.active && r.region).map((r) => r.region as string))],
        scheduling: { enabled: settings.schedulingEnabled, businessHours: settings.businessHours, busy: busyRows.map((b) => `${formatSpDate(b.startsAt).slice(0, 5)} às ${formatSpTime(b.startsAt)}`), current: null },
        catalog: catalog.map((c) => (locked ? maskCatalogItem(c.ai) : c.ai)),
        offerVideo,
        sellerHours: sellerAvailability(normalizeSellerHours(body.draft?.sellerHours ?? settings.sellerHours)),
        qualify,
        qualifyPending: locked,
        handoffAuto: Boolean(String(draft.handoffMessage ?? settings.handoffMessage ?? "").trim()),
        actions: actions.map((a) => ({ name: a.name, kind: a.kind, instructions: a.instructions })),
        columns: ruleColumns.map((c) => ({ name: c.name, rule: c.aiRule!.trim() })),
    });
    const aiOpts = { apiKey: key.apiKey, model, baseUrl: process.env.ANTHROPIC_BASE_URL };
    let d = await runSdrAgent(input(pending), aiOpts);
    if (!d) return NextResponse.json({ error: "A IA não respondeu" }, { status: 502 });
    let qualified = Boolean(body.qualified);
    if (!qualified && qualify.mode !== "OFF" && isQualified(qualify, d, leadTexts, null)) {
      qualified = true;
      if (pending) d = (await runSdrAgent(input(false), aiOpts).catch(() => null)) || d;
    }
    const unlocked = !pending || qualified;
    const parts = d.reply.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    // Fotos e vídeo como o cliente receberia (mesma foto e legenda do WhatsApp)
    const media: { kind: "image" | "video" | "text"; url: string | null; caption: string }[] = [];
    const itemIds = [...d.productCodes.map((r) => r.code), d.videoCode].map((c) => catalog.find((x) => x.ai.code === c)?.id).filter(Boolean) as string[];
    const [prodRows, imgRows] = itemIds.length
      ? await Promise.all([
          db.select().from(products).where(and(eq(products.accountId, auth.accountId), inArray(products.id, itemIds))),
          db
            .select({ id: productImages.id, productId: productImages.productId, label: productImages.label, active: productImages.active, availability: productImages.availability, leadTimeDays: productImages.leadTimeDays })
            .from(productImages)
            .where(inArray(productImages.productId, itemIds))
            .orderBy(asc(productImages.sort)),
        ])
      : [[], []];
    for (const ref of d.productCodes) {
      const product = prodRows.find((p) => p.id === catalog.find((c) => c.ai.code === ref.code)?.id);
      if (!product) continue;
      const img = pickProductImage(imgRows.filter((i) => i.productId === product.id), { label: ref.label });
      media.push({ kind: img ? "image" : "text", url: img ? `/api/products/image/${img.id}` : null, caption: productCaption(product, img, false, !unlocked) });
    }
    const videoItem = d.videoCode && unlocked ? catalog.find((c) => c.ai.code === d.videoCode && c.ai.hasVideo) : null;
    const videoProduct = videoItem ? prodRows.find((p) => p.id === videoItem.id) : null;
    if (videoProduct) media.push({ kind: "video", url: `/api/products/${videoProduct.id}/video`, caption: `*${videoProduct.name}*` });
    return NextResponse.json({
      parts,
      photos: d.productCodes.map((r) => {
        const item = catalog.find((c) => c.ai.code === r.code);
        return item ? `${item.ai.name}${r.label ? ` (${r.label})` : ""}` : r.code;
      }),
      video: d.videoCode ? catalog.find((c) => c.ai.code === d.videoCode && c.ai.hasVideo)?.ai.name || null : null,
      media,
      qualified,
      speed: typeof draft.replySpeed === "string" ? draft.replySpeed : settings.replySpeed,
      action: d.actionName || null,
      handoff: d.handoff,
      handoffMessage: d.handoff ? handoffPreview() : null,
      appointment: d.appointment ? `${d.appointment.subject} — ${d.appointment.date.split("-").reverse().join("/")} ${d.appointment.time}` : null,
      score: d.score,
      summary: d.summary,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
