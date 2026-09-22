/**
 * FLOW ENGINE SERVER — Servidor Separado para Executar Fluxos WhatsApp
 *
 * Responsabilidades:
 * - Manter conexão WhatsApp aberta via Baileys
 * - Monitorar fila de mensagens
 * - Interpretar e executar blocos de fluxo
 * - Gerenciar estado de conversas
 * - Logar execuções
 *
 * Roda como processo separado (scripts/flow-engine-server.mts)
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import * as http from "http";
import QRCode from "qrcode";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import {
  flows,
  flowBlocks,
  flowConnections,
  conversations,
  messages,
  leads,
  conversationStates,
  flowExecutions,
  aiSettings,
  sellers,
  tags,
  leadTags,
  distributionRules,
} from "../src/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runSdrAgent, pickSeller, type AgentDecision } from "../src/lib/ai/sdrAgent";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment
dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
const FLOW_ENGINE_PORT = process.env.FLOW_ENGINE_PORT || "3001";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

// Database setup
const pool = new Pool({ connectionString: DATABASE_URL });
// O "schema" é obrigatório para usar db.query.* (sem ele nenhuma mensagem era salva)
const db = drizzle(pool, { schema });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
/** Espera alguns segundos antes da IA responder, para juntar mensagens seguidas do cliente */
const AI_DEBOUNCE_MS = Number(process.env.AI_DEBOUNCE_MS || 6000);

// Auth directory
const AUTH_DIR = path.join(process.cwd(), "auth_info_baileys");
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock: ReturnType<typeof makeWASocket> | null = null;
let connectedPhone: string | null = null;
let currentQr: string | null = null;

/**
 * Conectar ao WhatsApp via Baileys
 */
async function connectWhatsApp() {
  console.log("[Flow Engine] Conectando ao WhatsApp...");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
  });

  // Listeners
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      console.log("[WhatsApp] Novo QR Code gerado. Abra a pagina do motor para escanear.");
      try {
        console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
      } catch {}
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "[WhatsApp]",
        shouldReconnect ? "Reconectando..." : "Desconectado"
      );

      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(), 3000);
      }
    } else if (connection === "open") {
      const id = sock!.user?.id;
      connectedPhone = id?.split(":")[0] || null;
      currentQr = null;
      console.log("✅ WhatsApp Conectado:", connectedPhone);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) {
        // Mensagem enviada pelo celular da loja (uma pessoa respondeu direto no WhatsApp)
        await handleOwnPhoneMessage(msg);
        continue;
      }

      console.log("[Mensagem Recebida]", msg.key.remoteJid);
      await handleIncomingMessage(msg);
    }
  });

  return sock;
}

/** Conversas que não são de clientes (grupos, status, canais) */
function isIgnoredJid(jid: string | null | undefined) {
  return (
    !jid ||
    jid.endsWith("@g.us") ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@newsletter") ||
    jid === "status@broadcast"
  );
}

/** Extrai o texto de qualquer tipo de mensagem do WhatsApp (null = ignorar) */
function extractText(message: any): { text: string; type: string } | null {
  if (!message) return null;
  const m =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message;

  if (m.conversation) return { text: m.conversation, type: "text" };
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, type: "text" };
  if (m.buttonsResponseMessage?.selectedDisplayText)
    return { text: m.buttonsResponseMessage.selectedDisplayText, type: "text" };
  if (m.listResponseMessage?.title) return { text: m.listResponseMessage.title, type: "text" };
  if (m.templateButtonReplyMessage?.selectedDisplayText)
    return { text: m.templateButtonReplyMessage.selectedDisplayText, type: "text" };
  if (m.imageMessage) return { text: m.imageMessage.caption || "[imagem]", type: "image" };
  if (m.videoMessage) return { text: m.videoMessage.caption || "[vídeo]", type: "video" };
  if (m.audioMessage) return { text: "[áudio]", type: "audio" };
  if (m.documentMessage) return { text: `[documento] ${m.documentMessage.fileName || ""}`.trim(), type: "document" };
  if (m.stickerMessage) return { text: "[figurinha]", type: "sticker" };
  if (m.locationMessage) return { text: "[localização]", type: "location" };
  if (m.contactMessage) return { text: "[contato]", type: "contact" };
  return null; // reações, avisos de sistema etc.
}

/** Número de telefone real (o WhatsApp novo às vezes manda um ID "@lid" no lugar) */
function phoneFromKey(key: any): string | null {
  const candidates = [key?.remoteJidAlt, key?.senderPn, key?.remoteJid];
  for (const c of candidates) {
    if (typeof c === "string" && c.endsWith("@s.whatsapp.net")) {
      return c.split("@")[0].split(":")[0];
    }
  }
  return null;
}

async function isSellerPhone(phone: string) {
  const tail = phone.replace(/\D/g, "").slice(-10);
  const all = await db.select({ phone: sellers.phone }).from(sellers);
  return all.some((s) => s.phone && s.phone.replace(/\D/g, "").slice(-10) === tail);
}

/**
 * Processar mensagem recebida
 */
async function handleIncomingMessage(msg: any) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (isIgnoredJid(phoneJid)) return;

    const extracted = extractText(msg.message);
    if (!extracted) return;
    const messageBody = extracted.text;
    const pushName: string | null = msg.pushName || null;
    const phone = phoneFromKey(msg.key);

    console.log(`[Mensagem] ${phoneJid}: "${messageBody.slice(0, 80)}"`);

    // Mensagem de um vendedor da equipe (ex.: respondendo o aviso de lead) não vira lead
    if (phone && (await isSellerPhone(phone))) {
      console.log(`[Mensagem] ${phone} é vendedor da equipe — ignorado como lead`);
      return;
    }

    // Evita duplicar se o WhatsApp reenviar o mesmo evento
    if (msg.key.id) {
      const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, msg.key.id) });
      if (dup) return;
    }

    // 1. Obter/criar conversa
    let conversation = await db.query.conversations.findFirst({
      where: eq(conversations.phoneJid, phoneJid),
    });

    if (!conversation) {
      const [newConv] = await db
        .insert(conversations)
        .values({ phoneJid, leadName: pushName || "Lead", lastMessageAt: new Date() })
        .onConflictDoNothing()
        .returning();
      conversation =
        newConv || (await db.query.conversations.findFirst({ where: eq(conversations.phoneJid, phoneJid) }));
    } else if (pushName && (!conversation.leadName || conversation.leadName === "Lead")) {
      await db.update(conversations).set({ leadName: pushName }).where(eq(conversations.id, conversation.id));
    }
    if (!conversation) return;

    // Card do lead no funil (Primeiro contato)
    const existingLead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversation.id) });
    if (!existingLead) {
      await db
        .insert(leads)
        .values({
          conversationId: conversation.id,
          cardName: pushName || "Lead",
          phone,
          stage: "FIRST_CONTACT",
        })
        .onConflictDoNothing();
    } else if (phone && !existingLead.phone) {
      await db.update(leads).set({ phone }).where(eq(leads.id, existingLead.id));
    }

    // 2. Registrar mensagem
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "IN",
      body: messageBody,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      sender: "LEAD",
    });
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.conversationId, conversation.id));

    // IA ligada? Ela cuida do atendimento (o construtor de fluxos antigo fica de lado)
    const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, "default") });
    if (settings?.enabled) {
      scheduleAi(conversation.id);
      return;
    }

    // 3. Encontrar fluxo ativo para esta conversa
    let state = await db.query.conversationStates.findFirst({
      where: and(
        eq(conversationStates.conversationId, conversation.id),
        eq(conversationStates.status, "ACTIVE")
      ),
    });

    // Se não há estado, iniciar novo fluxo (trigger: FIRST_MESSAGE)
    if (!state) {
      console.log("[Flow] Iniciando novo fluxo para conversa...");
      state = await startNewFlow(conversation.id, messageBody);

      if (!state) {
        console.log("[Flow] Nenhum fluxo encontrado para esta conversa");
        return;
      }
    }

    // 4. Executar próximo bloco
    await executeFlowBlock(state, conversation, messageBody);
  } catch (error) {
    console.error("[Error] handleIncomingMessage:", error);
  }
}

/**
 * Iniciar novo fluxo (trigger: FIRST_MESSAGE ou KEYWORD)
 */
async function startNewFlow(conversationId: string, messageBody: string) {
  try {
    // Buscar fluxos com trigger FIRST_MESSAGE (ordenado por prioridade)
    const activeFlows = await db
      .select()
      .from(flows)
      .where(eq(flows.enabled, true))
      .orderBy(flows.priority);

    if (activeFlows.length === 0) {
      return null;
    }

    // Usar primeiro fluxo (menor prioridade)
    const flow = activeFlows[0];

    // Criar state de conversa
    const [newState] = await db
      .insert(conversationStates)
      .values({
        conversationId,
        flowId: flow.id,
        currentBlockId: null,
        variables: { startedWith: messageBody },
        status: "ACTIVE",
      })
      .returning();

    console.log(
      `[Flow] Novo estado criado para fluxo "${flow.name}" (ID: ${flow.id})`
    );

    return newState;
  } catch (error) {
    console.error("[Error] startNewFlow:", error);
    return null;
  }
}

/**
 * Executar próximo bloco do fluxo
 */
async function executeFlowBlock(
  state: any,
  conversation: any,
  userMessage: string
) {
  try {
    // 1. Determinar próximo bloco
    let nextBlockId: string | null = null;

    if (!state.currentBlockId) {
      // Primeira execução: encontrar bloco START
      const startBlock = await db.query.flowBlocks.findFirst({
        where: and(
          eq(flowBlocks.flowId, state.flowId),
          eq(flowBlocks.type, "START")
        ),
      });
      nextBlockId = startBlock?.id || null;
    } else {
      // Próximo bloco baseado em conexões
      const connections = await db
        .select()
        .from(flowConnections)
        .where(eq(flowConnections.fromBlockId, state.currentBlockId));

      // Se há múltiplas conexões, usar primeira (em future: implementar condições)
      nextBlockId = connections[0]?.toBlockId || null;
    }

    if (!nextBlockId) {
      console.log("[Flow] Nenhum próximo bloco encontrado, encerrando fluxo");
      await db
        .update(conversationStates)
        .set({ status: "COMPLETED" })
        .where(eq(conversationStates.id, state.id));
      return;
    }

    // 2. Buscar bloco
    const block = await db.query.flowBlocks.findFirst({
      where: eq(flowBlocks.id, nextBlockId),
    });

    if (!block) {
      console.error("[Flow] Bloco não encontrado:", nextBlockId);
      return;
    }

    console.log(`[Flow] Executando bloco: ${block.type} (${block.id})`);

    // 3. Executar bloco
    const result = await executeBlock(block, conversation, userMessage, state);

    // 4. Registrar execução
    await db.insert(flowExecutions).values({
      stateId: state.id,
      blockId: block.id,
      executedAt: new Date(),
      result,
    });

    // 5. Atualizar estado
    await db
      .update(conversationStates)
      .set({
        currentBlockId: block.id,
        updatedAt: new Date(),
      })
      .where(eq(conversationStates.id, state.id));

    console.log(`[Flow] Bloco executado com sucesso: ${block.type}`);
  } catch (error) {
    console.error("[Error] executeFlowBlock:", error);
  }
}

/**
 * Executar lógica específica do bloco
 */
async function executeBlock(
  block: any,
  conversation: any,
  userMessage: string,
  state: any
): Promise<any> {
  const config = block.config || {};

  switch (block.type) {
    case "START":
      // Enviar mensagem inicial
      if (config.message) {
        return await sendMessage(
          conversation.phoneJid,
          config.message,
          config.delay
        );
      }
      return { success: true };

    case "TEXT_MESSAGE":
      // Enviar texto
      return await sendMessage(
        conversation.phoneJid,
        config.text || "Mensagem",
        config.delay
      );

    case "IMAGE":
      // Enviar imagem
      if (config.imageUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.imageUrl,
          "image",
          config.caption
        );
      }
      return { success: true };

    case "VIDEO":
      // Enviar vídeo
      if (config.videoUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.videoUrl,
          "video",
          config.caption
        );
      }
      return { success: true };

    case "AUDIO":
      // Enviar áudio
      if (config.audioUrl) {
        return await sendMedia(conversation.phoneJid, config.audioUrl, "audio");
      }
      return { success: true };

    case "DOCUMENT":
      // Enviar documento
      if (config.documentUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.documentUrl,
          "document",
          null,
          config.fileName
        );
      }
      return { success: true };

    case "LIST":
      // Enviar menu/lista
      return await sendList(
        conversation.phoneJid,
        config.title,
        config.options
      );

    case "RESPONSE_WAIT":
      // Apenas marca que está aguardando resposta (mensagem já foi enviada)
      return { success: true, waiting: true };

    case "CONDITION":
      // Condição (implementado em conexões, aqui passa)
      return { success: true };

    case "END":
      // Encerrar fluxo
      if (config.message) {
        await sendMessage(conversation.phoneJid, config.message);
      }
      await db
        .update(conversationStates)
        .set({ status: "COMPLETED" })
        .where(eq(conversationStates.id, state.id));
      return { success: true, ended: true };

    default:
      return { success: true, blockType: block.type };
  }
}

// ============================================================================
// ATENDIMENTO COM IA (SDR)
// ============================================================================

/** IDs de mensagens enviadas por este motor (para não confundir com mensagens do celular) */
const recentSentIds: string[] = [];
function rememberSent(id: string) {
  recentSentIds.push(id);
  if (recentSentIds.length > 500) recentSentIds.shift();
}

/**
 * Alguém respondeu o cliente direto pelo celular da loja:
 * registra no histórico e pausa a IA desse lead (a pessoa assumiu).
 */
async function handleOwnPhoneMessage(msg: any) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (isIgnoredJid(phoneJid) || !msg.key.id || recentSentIds.includes(msg.key.id)) return;
    const extracted = extractText(msg.message);
    if (!extracted) return;
    const conversation = await db.query.conversations.findFirst({ where: eq(conversations.phoneJid, phoneJid) });
    if (!conversation) return;
    const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, msg.key.id) });
    if (dup) return;

    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "OUT",
      body: extracted.text,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt: new Date(),
      sender: "HUMAN",
    });
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));
    await db
      .update(leads)
      .set({ aiPaused: true, updatedAt: new Date() })
      .where(eq(leads.conversationId, conversation.id));
    console.log(`[IA] Resposta manual pelo celular em ${phoneJid} — IA pausada para este lead`);
  } catch (error) {
    console.error("[Error] handleOwnPhoneMessage:", error);
  }
}

const aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
const aiRunning = new Set<string>();
let warnedNoKey = false;

/** Agenda a IA para responder (espera o cliente terminar de digitar) */
function scheduleAi(conversationId: string) {
  const current = aiTimers.get(conversationId);
  if (current) clearTimeout(current);
  aiTimers.set(
    conversationId,
    setTimeout(() => {
      aiTimers.delete(conversationId);
      if (aiRunning.has(conversationId)) {
        // Ainda respondendo a anterior: tenta de novo logo depois
        scheduleAi(conversationId);
        return;
      }
      aiRunning.add(conversationId);
      runAi(conversationId)
        .catch((err) => console.error("[IA] Erro:", err?.message || err))
        .finally(() => aiRunning.delete(conversationId));
    }, AI_DEBOUNCE_MS)
  );
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Telefone do vendedor em formato do WhatsApp (adiciona 55 se faltar) */
function sellerJid(phone: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `${d.length <= 11 ? "55" + d : d}@s.whatsapp.net`;
}

async function runAi(conversationId: string) {
  const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, "default") });
  if (!settings?.enabled) return;
  if (!ANTHROPIC_API_KEY) {
    if (!warnedNoKey) console.warn("[IA] ANTHROPIC_API_KEY não configurada no motor — IA não vai responder.");
    warnedNoKey = true;
    return;
  }

  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  const lead = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
    with: { leadTags: { with: { tag: true } } },
  });
  if (!conversation || !lead) return;
  if (lead.aiPaused || lead.sellerId || lead.stage === "SALE") return;

  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
    limit: 30,
  });
  const history = recent.reverse();
  if (!history.length || history[history.length - 1].direction !== "IN") return;

  const allTags = await db.select().from(tags);
  const rules = await db.query.distributionRules.findMany({ with: { seller: true } });

  console.log(`[IA] Atendendo ${conversation.phoneJid}...`);
  const decision = await runSdrAgent(
    {
      systemPrompt: settings.systemPrompt || "Você é a atendente virtual da loja.",
      lead: {
        name: lead.cardName && lead.cardName !== "Lead" ? lead.cardName : conversation.leadName,
        city: lead.city,
        interest: lead.interest,
        saleType: lead.saleType,
        stage: lead.stage,
        score: lead.score,
        summary: lead.aiSummary,
      },
      history: history.map((m) => ({ direction: m.direction, body: m.body, sender: m.sender })),
      tags: allTags.map((t) => t.name),
      regions: [...new Set(rules.filter((r) => r.active && r.region).map((r) => r.region as string))],
    },
    {
      apiKey: ANTHROPIC_API_KEY,
      model: settings.model || "claude-sonnet-4-5",
      baseUrl: process.env.ANTHROPIC_BASE_URL,
    }
  );
  if (!decision) return;

  // Uma pessoa assumiu enquanto a IA pensava? Não responde por cima.
  const fresh = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
  if (!fresh || fresh.aiPaused || fresh.sellerId) return;
  const newer = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
  });
  if (newer && newer.id !== history[history.length - 1].id && newer.direction === "IN") {
    // Chegou mensagem nova do cliente: a próxima rodada responde tudo junto
    scheduleAi(conversationId);
    return;
  }

  await applyDecision(lead.id, conversationId, decision, allTags);

  // Envia a resposta (até 3 balões, como uma pessoa digitando)
  const parts = decision.reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await pause(1200);
    await sendMessage(conversation.phoneJid, parts[i], 0, "AI");
  }

  if (decision.handoff) {
    await handoffToSeller(lead.id, conversation.phoneJid, conversation.leadName, decision, settings, rules);
  }
  console.log(
    `[IA] Respondido ${conversation.phoneJid} — nota ${decision.score}${decision.handoff ? " — transferido" : ""}`
  );
}

async function applyDecision(
  leadId: string,
  conversationId: string,
  d: AgentDecision,
  allTags: { id: string; name: string }[]
) {
  const current = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!current) return;
  const order = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"];
  // O estágio só avança (a IA não rebaixa um lead que alguém já moveu para frente)
  const stage =
    order.indexOf(d.stage) > order.indexOf(current.stage) || !order.includes(current.stage) ? d.stage : current.stage;

  const set: Record<string, unknown> = {
    stage: d.handoff && order.indexOf(stage) < order.indexOf("HOT_LEAD") ? "HOT_LEAD" : stage,
    score: d.score,
    aiSummary: d.summary || current.aiSummary,
    updatedAt: new Date(),
  };
  if (d.city) set.city = d.city;
  if (d.interest) set.interest = d.interest;
  if (d.saleType !== "ANY") set.saleType = d.saleType;
  if (d.name && (!current.cardName || current.cardName === "Lead" || current.cardName === (await pushNameOf(conversationId)))) {
    set.cardName = d.name;
    await db.update(conversations).set({ leadName: d.name }).where(eq(conversations.id, conversationId));
  }
  await db.update(leads).set(set).where(eq(leads.id, leadId));

  for (const name of d.tags) {
    const tag = allTags.find((t) => t.name === name);
    if (tag) await db.insert(leadTags).values({ leadId, tagId: tag.id }).onConflictDoNothing();
  }
}

async function pushNameOf(conversationId: string) {
  const c = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  return c?.leadName || null;
}

async function handoffToSeller(
  leadId: string,
  leadJid: string,
  leadName: string | null,
  d: AgentDecision,
  settings: { handoffMessage: string | null; notifySeller: boolean },
  rules: { region: string | null; saleType: "ANY" | "WHOLESALE" | "RETAIL"; priority: number; active: boolean; sellerId: string; seller: { active: boolean } | null }[]
) {
  const current = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  const city = d.city || current?.city || null;
  const saleType = d.saleType !== "ANY" ? d.saleType : current?.saleType || "ANY";

  const sellerId = pickSeller(
    rules.map((r) => ({ ...r, sellerActive: r.seller?.active !== false })),
    city,
    saleType
  );
  const seller = sellerId ? await db.query.sellers.findFirst({ where: eq(sellers.id, sellerId) }) : null;

  await db
    .update(leads)
    .set({ sellerId: seller?.id || null, aiPaused: true, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  const template = settings.handoffMessage ?? "";
  if (template.trim()) {
    await pause(1200);
    await sendMessage(leadJid, template.replace(/\{vendedor\}/g, seller?.name || "um de nossos consultores"), 0, "AI");
  }

  if (seller && settings.notifySeller) {
    const jid = sellerJid(seller.phone);
    const leadPhone = current?.phone || (leadJid.endsWith("@s.whatsapp.net") ? leadJid.split("@")[0] : null);
    if (jid) {
      const lines = [
        `🔔 *Novo lead para você*`,
        `*Cliente:* ${d.name || current?.cardName || leadName || "sem nome"}`,
        city ? `*Cidade:* ${city}` : null,
        d.interest ? `*Interesse:* ${d.interest}` : null,
        `*Nota:* ${d.score}/100`,
        d.summary ? `\n${d.summary}` : null,
        leadPhone ? `\nFalar com o cliente: https://wa.me/${leadPhone}` : `\nAbra o painel em Leads para continuar a conversa.`,
      ].filter(Boolean);
      const r = await sendMessage(jid, lines.join("\n"), 0, "AI");
      if (r?.error) console.warn("[IA] Não consegui avisar o vendedor:", r.error);
    }
  }
}

/**
 * Enviar mensagem de texto
 */
async function sendMessage(
  phoneJid: string,
  text: string,
  delay?: number,
  sender: "AI" | "HUMAN" | "FLOW" = "FLOW"
): Promise<any> {
  if (!sock || !connectedPhone) return { error: "WhatsApp não está conectado" };

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const response = await sock!.sendMessage(phoneJid, { text });
        if (response?.key?.id) rememberSent(response.key.id);

        // Registrar mensagem enviada
        const conv = await db.query.conversations.findFirst({
          where: eq(conversations.phoneJid, phoneJid),
        });

        if (conv) {
          await db.insert(messages).values({
            conversationId: conv.id,
            direction: "OUT",
            body: text,
            messageType: "text",
            whatsappMessageId: response?.key?.id,
            sentAt: new Date(),
            sender,
          });
          await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
        }

        resolve({ success: true, messageId: response?.key?.id });
      } catch (error) {
        console.error("[Error] sendMessage:", error);
        resolve({ error: String(error) });
      }
    }, (delay || 0) * 1000);
  });
}

/**
 * Enviar mídia (imagem, vídeo, áudio, documento)
 */
async function sendMedia(
  phoneJid: string,
  url: string,
  type: "image" | "video" | "audio" | "document",
  caption?: string,
  fileName?: string
): Promise<any> {
  if (!sock) return { error: "Socket not connected" };

  try {
    const messageObject: any = {
      [type]:
        type === "document"
          ? { url, filename: fileName || "document" }
          : { url },
    };

    if (caption && type !== "audio" && type !== "document") {
      messageObject.caption = caption;
    }

    const response = await sock!.sendMessage(phoneJid, messageObject);

    return { success: true, messageId: response.key.id };
  } catch (error) {
    console.error(`[Error] sendMedia (${type}):`, error);
    return { error: String(error) };
  }
}

/**
 * Enviar menu/lista de opções
 */
async function sendList(
  phoneJid: string,
  title: string,
  optionsStr?: string
): Promise<any> {
  if (!sock) return { error: "Socket not connected" };

  try {
    // Parse opções de string (uma por linha)
    const options = (optionsStr || "").split("\n").filter((o) => o.trim());

    if (options.length === 0) {
      return await sendMessage(phoneJid, title || "Escolha uma opção");
    }

    // Criar lista de seções
    const sections = [
      {
        title: "Opções",
        rows: options.map((opt, idx) => ({
          id: `opt_${idx}`,
          title: opt.trim(),
          description: "",
        })),
      },
    ];

    const response = await sock!.sendMessage(phoneJid, {
      listMessage: {
        title: title || "Escolha",
        description: "",
        buttonText: "Ver opções",
        sections,
      },
    });

    return { success: true, messageId: response.key.id };
  } catch (error) {
    console.error("[Error] sendList:", error);
    // Fallback: enviar como texto
    return await sendMessage(phoneJid, title || "Escolha uma opção");
  }
}

/**
 * Pagina de status / QR Code (abrir pelo dominio do servico no Railway)
 */
function startStatusServer() {
  const port = Number(process.env.PORT || FLOW_ENGINE_PORT);
  const token = process.env.QR_ACCESS_TOKEN;
  http
    .createServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("ok");
      }

      // API interna usada pelo app Next.js (SDR): status da conexão e envio
      // manual de mensagens pelo inbox. Protegida pelo mesmo token do QR
      // quando QR_ACCESS_TOKEN está configurado.
      const internalToken = req.headers["x-internal-token"];
      const isAuthorized = !token || internalToken === token;

      if (url.pathname === "/status.json") {
        if (!isAuthorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "unauthorized" }));
        }
        const qrDataUrl = currentQr
          ? await QRCode.toDataURL(currentQr, { width: 320 })
          : null;
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            connected: Boolean(connectedPhone),
            phone: connectedPhone,
            qrDataUrl,
            aiReady: Boolean(ANTHROPIC_API_KEY),
          })
        );
      }

      if (process.env.FLOW_ENGINE_SELFTEST === "1" && url.pathname === "/__test/incoming" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const msg = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        if (msg.key?.fromMe) await handleOwnPhoneMessage(msg);
        else await handleIncomingMessage(msg);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end("{}");
      }

      if (url.pathname === "/send" && req.method === "POST") {
        if (!isAuthorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "unauthorized" }));
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { phoneJid, text, sender } = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
          if (!phoneJid || !text) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "phoneJid e text são obrigatórios" }));
          }
          const result = await sendMessage(phoneJid, text, 0, sender === "AI" ? "AI" : "HUMAN");
          res.writeHead(result?.error ? 502 : 200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: String(error) }));
        }
      }

      if (token && url.searchParams.get("token") !== token) {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        return res.end("<h2>Acesso negado. Use ?token=SUA_SENHA no final do endereco.</h2>");
      }
      let body: string;
      if (connectedPhone) {
        body = `<h1>&#9989; WhatsApp conectado</h1><p>Numero: ${connectedPhone}</p>`;
      } else if (currentQr) {
        const img = await QRCode.toDataURL(currentQr, { width: 320 });
        body = `<h1>Escaneie com o WhatsApp</h1><p>No celular: Configuracoes &rarr; Aparelhos conectados &rarr; Conectar aparelho</p><img src="${img}" alt="QR Code"/><p>A pagina atualiza sozinha.</p>`;
      } else {
        body = `<h1>Aguardando QR Code...</h1><p>A pagina atualiza sozinha.</p>`;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>Motor WhatsApp</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">${body}</body></html>`);
    })
    .listen(port, () => console.log(`[Status] Pagina do QR Code na porta ${port}`));
}

/**
 * Main
 */
async function main() {
  console.log("🚀 Flow Engine Server iniciando...");
  console.log("📱 Conectando ao WhatsApp via Baileys...");

  startStatusServer();

  // Modo de teste local (nunca ligado em produção): simula o WhatsApp
  if (process.env.FLOW_ENGINE_SELFTEST === "1") {
    console.log("🧪 SELFTEST: WhatsApp simulado");
    connectedPhone = "5500000000000";
    sock = {
      sendMessage: async (jid: string, content: any) => {
        console.log(`[SELFTEST] -> ${jid}: ${content?.text}`);
        return { key: { id: "TEST" + Math.random().toString(36).slice(2) } };
      },
      end: () => {},
    } as any;
    return;
  }

  try {
    await connectWhatsApp();

    console.log(
      `✅ Flow Engine rodando na porta ${FLOW_ENGINE_PORT} (PID: ${process.pid})`
    );
    console.log(
      "📡 Aguardando mensagens... (pressione Ctrl+C para parar)\n"
    );

    // Manter processo vivo
    process.on("SIGINT", async () => {
      console.log("\n🛑 Encerrando Flow Engine...");
      sock?.end(new Error("User requested shutdown"));
      await pool.end();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar Flow Engine:", error);
    process.exit(1);
  }
}

main();
