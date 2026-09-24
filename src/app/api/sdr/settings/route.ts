export const dynamic = "force-dynamic";
import { STYLE_PRESETS, LENGTH_OPTIONS, EMOJI_OPTIONS, SPEED_OPTIONS } from "@/lib/ai/style";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, aiSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getAccount, resolveAccountAiKey, resolveAccountVoiceKey } from "@/lib/tenancy/server";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/tenancy/secret";

function defaultPrompt(company: string) {
  return `Você é a atendente virtual da ${company}. Você conversa pelo WhatsApp com pessoas interessadas nos nossos produtos e serviços.

Como atender:
- Seja simpática, objetiva e breve (mensagens curtas, como WhatsApp de verdade). No máximo uma pergunta por mensagem.
- Descubra: o nome da pessoa, a cidade/bairro, o que ela procura e se a compra é para uso próprio (varejo) ou para revender (atacado).
- Responda dúvidas gerais sem inventar preços, prazos ou estoque. Se não souber, diga que um consultor vai confirmar.
- Se a pessoa quiser visitar a loja, fazer um test-drive ou receber uma ligação, combine dia e horário e marque na agenda.
- Quando a pessoa estiver pronta para comprar, pedir orçamento/preço, pedir para falar com alguém, ou for atacado, transfira para um vendedor.`;
}

import { normalizeSellerHours, DEFAULT_AFTER_HOURS } from "@/lib/ai/hours";
import { normalizeQualify } from "@/lib/ai/qualify";
const DEFAULT_HANDOFF =
  "Perfeito! Vou te passar agora para {vendedor}, nosso consultor, que vai continuar seu atendimento por aqui. 😊";
const DEFAULT_REMINDER =
  "Olá, {nome}! Passando para lembrar do nosso compromisso: {assunto} em {data} às {hora}. Qualquer coisa é só responder aqui. 😊";

async function ensure(accountId: string, company: string) {
  let s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
  if (!s) {
    await db
      .insert(aiSettings)
      .values({
        id: accountId,
        systemPrompt: defaultPrompt(company),
        handoffMessage: DEFAULT_HANDOFF,
        reminderMessage: DEFAULT_REMINDER,
      })
      .onConflictDoNothing();
    s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
  } else if (!s.systemPrompt && s.handoffMessage === null && s.reminderMessage === null) {
    // Registro criado por outra tela (ex.: Produtos) antes de abrir as configurações: completa os textos padrão
    [s] = await db
      .update(aiSettings)
      .set({ systemPrompt: defaultPrompt(company), handoffMessage: DEFAULT_HANDOFF, reminderMessage: DEFAULT_REMINDER })
      .where(eq(aiSettings.id, accountId))
      .returning();
  }
  return s!;
}

async function payload(accountId: string) {
  const account = await getAccount(accountId);
  const s = await ensure(accountId, account?.name || "empresa");
  const ai = await resolveAccountAiKey(accountId);
  const ownKey = decryptSecret(account?.aiApiKeyEnc);
  const parent = await getAccount(account?.parentId);
  const [openai, eleven] = await Promise.all([
    resolveAccountVoiceKey(accountId, "openai"),
    resolveAccountVoiceKey(accountId, "eleven"),
  ]);
  const voiceInfo = (r: typeof openai, enc: string | null | undefined) => ({
    ready: Boolean(r.apiKey),
    reason: r.reason,
    providerName: r.providerAccountName,
    ownKeyHint: maskKey(decryptSecret(enc)),
  });
  return {
    ...s,
    handoffMessage: s.handoffMessage ?? DEFAULT_HANDOFF,
    sellerHours: normalizeSellerHours(s.sellerHours),
    afterHoursMessage: s.afterHoursMessage ?? DEFAULT_AFTER_HOURS,
    qualify: normalizeQualify(s.qualify),
    reminderMessage: s.reminderMessage ?? DEFAULT_REMINDER,
    integration: {
      /** OWN | PARENT | NONE — definido por quem cadastrou a conta */
      source: account?.type === "MASTER" ? "OWN" : account?.aiSource || "PARENT",
      ownKeyHint: maskKey(ownKey),
      usesEnvKey: account?.type === "MASTER" && !ownKey && Boolean(process.env.ANTHROPIC_API_KEY),
      parentName: parent?.name || null,
      ready: Boolean(ai.apiKey),
      reason: ai.reason,
      providerName: ai.providerAccountName,
    },
    voice: {
      openai: voiceInfo(openai, account?.openaiKeyEnc),
      eleven: voiceInfo(eleven, account?.elevenKeyEnc),
    },
  };
}

export async function GET() {
  const auth = await requireUser(["configuracoes", "whatsapp"]);
  if (auth.error) return auth.error;
  return NextResponse.json(await payload(auth.accountId));
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const account = await getAccount(auth.accountId);
  await ensure(auth.accountId, account?.name || "empresa");
  const body = await req.json();

  // Chave própria da IA (só quando a conta tem integração própria)
  if (body.apiKey !== undefined) {
    const source = account?.type === "MASTER" ? "OWN" : account?.aiSource;
    if (source !== "OWN") {
      return NextResponse.json(
        { error: "Esta conta usa a IA de quem a cadastrou. Peça para liberar integração própria." },
        { status: 403 }
      );
    }
    const key = String(body.apiKey || "").trim();
    if (key && !key.startsWith("sk-")) {
      return NextResponse.json({ error: "Chave inválida. Ela começa com sk-ant-..." }, { status: 400 });
    }
    await db
      .update(accounts)
      .set({ aiApiKeyEnc: key ? encryptSecret(key) : null })
      .where(eq(accounts.id, auth.accountId));
  }

  // Chaves de áudio (mesma regra: só quem tem integração própria cadastra)
  for (const [field, column, prefix, label] of [
    ["openaiKey", "openaiKeyEnc", "sk-", "OpenAI"],
    ["elevenKey", "elevenKeyEnc", "", "ElevenLabs"],
  ] as const) {
    if (body[field] === undefined) continue;
    const source = account?.type === "MASTER" ? "OWN" : account?.aiSource;
    if (source !== "OWN") {
      return NextResponse.json(
        { error: "Esta conta usa as integrações de quem a cadastrou. Peça para liberar integração própria." },
        { status: 403 }
      );
    }
    const key = String(body[field] || "").trim();
    if (key && prefix && !key.startsWith(prefix)) {
      return NextResponse.json({ error: `Chave da ${label} inválida. Ela começa com ${prefix}...` }, { status: 400 });
    }
    await db
      .update(accounts)
      .set({ [column]: key ? encryptSecret(key) : null })
      .where(eq(accounts.id, auth.accountId));
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.transcribeAudio === "boolean") set.transcribeAudio = body.transcribeAudio;
  if (typeof body.voiceReplies === "boolean") set.voiceReplies = body.voiceReplies;
  if (body.voiceId !== undefined) set.voiceId = String(body.voiceId || "").slice(0, 80) || null;
  if (body.voiceName !== undefined) set.voiceName = String(body.voiceName || "").slice(0, 120) || null;
  if (typeof body.systemPrompt === "string") set.systemPrompt = body.systemPrompt;
  if (typeof body.enabled === "boolean") set.enabled = body.enabled;
  if (typeof body.notifySeller === "boolean") set.notifySeller = body.notifySeller;
  if (typeof body.schedulingEnabled === "boolean") set.schedulingEnabled = body.schedulingEnabled;
  if (typeof body.model === "string" && body.model.trim()) set.model = body.model.trim().slice(0, 80);
  if (typeof body.handoffMessage === "string") set.handoffMessage = body.handoffMessage;
  if (typeof body.reminderMessage === "string") set.reminderMessage = body.reminderMessage;
  if (typeof body.businessHours === "string") set.businessHours = body.businessHours;
  if (typeof body.signMessages === "boolean") set.signMessages = body.signMessages;
  // Estilo e ritmo
  if (STYLE_PRESETS.some((p) => p.key === body.style)) set.style = body.style;
  if (body.styleCustom !== undefined) set.styleCustom = String(body.styleCustom || "").slice(0, 3000) || null;
  if (LENGTH_OPTIONS.some((o) => o.key === body.replyLength)) set.replyLength = body.replyLength;
  if (EMOJI_OPTIONS.some((o) => o.key === body.emojiLevel)) set.emojiLevel = body.emojiLevel;
  if (SPEED_OPTIONS.some((o) => o.key === body.replySpeed)) set.replySpeed = body.replySpeed;
  if (typeof body.offerVideo === "boolean") set.offerVideo = body.offerVideo;
  if (body.sellerHours && typeof body.sellerHours === "object") set.sellerHours = normalizeSellerHours(body.sellerHours);
  if (typeof body.rotationEnabled === "boolean") set.rotationEnabled = body.rotationEnabled;
  if (body.rotationBatch !== undefined) set.rotationBatch = Math.max(1, Math.min(50, Math.round(Number(body.rotationBatch) || 1)));
  if (body.qualify && typeof body.qualify === "object") set.qualify = normalizeQualify(body.qualify);
  if (typeof body.afterHoursMessage === "string") set.afterHoursMessage = body.afterHoursMessage.slice(0, 1000);
  if (body.alertPhone !== undefined) set.alertPhone = String(body.alertPhone || "").replace(/\D/g, "").slice(0, 20) || null;
  if (body.reminderMinutesBefore !== undefined) {
    set.reminderMinutesBefore = Math.max(0, Math.min(1440, Number(body.reminderMinutesBefore) || 0));
  }
  await db.update(aiSettings).set(set).where(eq(aiSettings.id, auth.accountId));
  return NextResponse.json(await payload(auth.accountId));
}
