export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings, distributionRules, tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { resolveAccountAiKey, getAccount } from "@/lib/tenancy/server";
import { runSdrAgent } from "@/lib/ai/sdrAgent";
import { loadCatalogFor } from "@/lib/ai/catalog";
import { ensureActions } from "@/lib/actions/shared";
import { ensureFunnels, ensureColumns } from "@/lib/funnel/shared";

/**
 * POST — conversa de teste com a IA (nada é salvo nem enviado).
 * Body: { messages: [{ from: "lead" | "ai", text }], draft?: { systemPrompt, style, styleCustom, replyLength, emojiLevel } }
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

  const [tagRows, rules, allActions, funnelList, account] = await Promise.all([
    db.select({ name: tags.name }).from(tags).where(eq(tags.accountId, auth.accountId)),
    db.select().from(distributionRules).where(eq(distributionRules.accountId, auth.accountId)),
    ensureActions(db, auth.accountId),
    ensureFunnels(db, auth.accountId),
    getAccount(auth.accountId),
  ]);
  const actions = allActions.filter((a) => a.active);
  const catalog = settings.catalogEnabled ? await loadCatalogFor(db, auth.accountId, actions) : [];
  const columns = (await Promise.all(funnelList.map((f) => ensureColumns(db, auth.accountId, f.id)))).flat();
  const ruleColumns = columns.filter((c) => c.kind === "CUSTOM" && c.aiRule?.trim());

  try {
    const d = await runSdrAgent(
      {
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
        scheduling: { enabled: settings.schedulingEnabled, businessHours: settings.businessHours, busy: [], current: null },
        catalog: catalog.map((c) => c.ai),
        actions: actions.map((a) => ({ name: a.name, kind: a.kind, instructions: a.instructions })),
        columns: ruleColumns.map((c) => ({ name: c.name, rule: c.aiRule!.trim() })),
      },
      { apiKey: key.apiKey, model: settings.model || "claude-sonnet-4-5", baseUrl: process.env.ANTHROPIC_BASE_URL }
    );
    if (!d) return NextResponse.json({ error: "A IA não respondeu" }, { status: 502 });
    const parts = d.reply.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    return NextResponse.json({
      parts,
      photos: d.productCodes.map((r) => {
        const item = catalog.find((c) => c.ai.code === r.code);
        return item ? `${item.ai.name}${r.label ? ` (${r.label})` : ""}` : r.code;
      }),
      action: d.actionName || null,
      handoff: d.handoff,
      appointment: d.appointment ? `${d.appointment.subject} — ${d.appointment.date.split("-").reverse().join("/")} ${d.appointment.time}` : null,
      score: d.score,
      summary: d.summary,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
