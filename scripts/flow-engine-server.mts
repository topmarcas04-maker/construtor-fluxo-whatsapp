/**
 * MOTOR DO WHATSAPP (processo separado do site)
 *
 * - Mantém um WhatsApp conectado para CADA conta (Master, parceiros e clientes)
 * - A sessão fica guardada no banco (tabela wa_auth): novos deploys não derrubam a conexão
 * - Recebe mensagens, cria leads, chama a IA da conta (chave própria ou herdada)
 * - Marca horários na agenda quando a IA combina com o cliente
 * - Dispara os lembretes da agenda no horário
 *
 * Roda com: npm run flow:engine
 */

import {
  makeWASocket,
  DisconnectReason,
  Browsers,
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import * as http from "http";
import QRCode from "qrcode";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import {
  accounts,
  waAuth,
  conversations,
  messages,
  leads,
  aiSettings,
  sellers,
  tags,
  leadTags,
  appointments,
} from "../src/db/schema";
import { eq, and, desc, gte, lt, isNull, sql } from "drizzle-orm";
import { runSdrAgent, pickSeller, type AgentDecision } from "../src/lib/ai/sdrAgent";
import { resolveAiKey } from "../src/lib/tenancy/aiKey";
import { fromSpDateTime, formatSpDate, formatSpTime, fillTemplate } from "../src/lib/time";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não configurada");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

/** Espera alguns segundos antes da IA responder, para juntar mensagens seguidas do cliente */
const AI_DEBOUNCE_MS = Number(process.env.AI_DEBOUNCE_MS || 6000);
const SELFTEST = process.env.FLOW_ENGINE_SELFTEST === "1";

type Sender = "AI" | "HUMAN" | "AUTO";
type Sock = ReturnType<typeof makeWASocket>;

interface Session {
  accountId: string;
  sock: Sock | null;
  state: "starting" | "qr" | "connected" | "idle";
  phone: string | null;
  qr: string | null;
  qrCount: number;
  stopping: boolean;
}

const sessions = new Map<string, Session>();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// SESSÃO DO WHATSAPP GUARDADA NO BANCO
// ============================================================================

async function readAuth(accountId: string, key: string) {
  const row = await db.query.waAuth.findFirst({ where: and(eq(waAuth.accountId, accountId), eq(waAuth.key, key)) });
  return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
}

async function writeAuth(accountId: string, key: string, value: unknown) {
  const json = JSON.stringify(value, BufferJSON.replacer);
  await db
    .insert(waAuth)
    .values({ accountId, key, value: json })
    .onConflictDoUpdate({ target: [waAuth.accountId, waAuth.key], set: { value: json } });
}

async function removeAuth(accountId: string, key: string) {
  await db.delete(waAuth).where(and(eq(waAuth.accountId, accountId), eq(waAuth.key, key)));
}

async function clearAuth(accountId: string) {
  await db.delete(waAuth).where(eq(waAuth.accountId, accountId));
}

async function useDbAuthState(accountId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const creds = (await readAuth(accountId, "creds")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readAuth(accountId, `${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeAuth(accountId, key, value) : removeAuth(accountId, key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeAuth(accountId, "creds", creds),
  };
}

async function hasSavedLogin(accountId: string) {
  const creds = await readAuth(accountId, "creds");
  return Boolean(creds?.registered || creds?.me?.id);
}

// ============================================================================
// CONEXÕES (UMA POR CONTA)
// ============================================================================

function getSession(accountId: string): Session {
  let s = sessions.get(accountId);
  if (!s) {
    s = { accountId, sock: null, state: "idle", phone: null, qr: null, qrCount: 0, stopping: false };
    sessions.set(accountId, s);
  }
  return s;
}

async function startSession(accountId: string) {
  const s = getSession(accountId);
  if (s.sock && s.state !== "idle") return s;
  s.stopping = false;
  s.state = "starting";
  s.qr = null;

  if (SELFTEST) {
    s.sock = {
      sendMessage: async (jid: string, content: any) => {
        console.log(`[SELFTEST ${accountId.slice(0, 8)}] -> ${jid}: ${content?.text}`);
        return { key: { id: "TEST" + Math.random().toString(36).slice(2) } };
      },
      end: () => {},
      logout: async () => {},
    } as unknown as Sock;
    s.state = "connected";
    s.phone = "55000" + accountId.replace(/\D/g, "").slice(0, 8);
    return s;
  }

  const { state, saveCreds } = await useDbAuthState(accountId);
  const sock = makeWASocket({ auth: state, browser: Browsers.ubuntu("Chrome"), markOnlineOnConnect: false });
  s.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    // Evento de uma conexão antiga (já substituída): ignora
    if (s.sock !== sock) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      s.qr = qr;
      s.state = "qr";
      s.qrCount++;
      console.log(`[WhatsApp ${accountId.slice(0, 8)}] QR Code gerado (${s.qrCount})`);
    }
    if (connection === "open") {
      s.state = "connected";
      s.qr = null;
      s.qrCount = 0;
      s.phone = sock.user?.id?.split(":")[0] || null;
      console.log(`✅ [WhatsApp ${accountId.slice(0, 8)}] conectado: ${s.phone}`);
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      s.sock = null;
      s.phone = null;
      if (s.stopping) {
        s.state = "idle";
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        console.log(`[WhatsApp ${accountId.slice(0, 8)}] desconectado pelo celular`);
        await clearAuth(accountId);
        s.state = "idle";
        s.qr = null;
        return;
      }
      // QR expirou sem ninguém ler: para (a pessoa clica em "Gerar QR Code" de novo)
      if (!(await hasSavedLogin(accountId)) && s.qrCount >= 5) {
        console.log(`[WhatsApp ${accountId.slice(0, 8)}] QR expirou sem leitura — aguardando novo pedido`);
        s.state = "idle";
        s.qr = null;
        s.qrCount = 0;
        return;
      }
      s.state = "starting";
      setTimeout(() => startSession(accountId).catch((e) => console.error("[WhatsApp] reconexão:", e)), 3000);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) await handleOwnPhoneMessage(accountId, msg);
      else await handleIncomingMessage(accountId, msg);
    }
  });

  return s;
}

async function stopSession(accountId: string, logout: boolean) {
  const s = getSession(accountId);
  s.stopping = true;
  try {
    if (logout) await s.sock?.logout().catch(() => {});
    s.sock?.end(undefined);
  } catch {}
  s.sock = null;
  s.state = "idle";
  s.qr = null;
  s.phone = null;
  if (logout) await clearAuth(accountId);
}

/** Reabre as conexões salvas (ao iniciar e de tempos em tempos) */
async function syncSessions() {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.waEnabled, true), eq(accounts.active, true)));
  for (const { id } of rows) {
    const s = getSession(id);
    if (s.state === "idle" && !s.sock && (SELFTEST || (await hasSavedLogin(id)))) {
      console.log(`[WhatsApp ${id.slice(0, 8)}] reabrindo sessão salva`);
      await startSession(id).catch((e) => console.error("[WhatsApp] start:", e));
      await pause(500);
    }
  }
}

// ============================================================================
// MENSAGENS
// ============================================================================

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
  return null;
}

/** Número de telefone real (o WhatsApp novo às vezes manda um ID "@lid" no lugar) */
function phoneFromKey(key: any): string | null {
  for (const c of [key?.remoteJidAlt, key?.senderPn, key?.remoteJid]) {
    if (typeof c === "string" && c.endsWith("@s.whatsapp.net")) return c.split("@")[0].split(":")[0];
  }
  return null;
}

async function isSellerPhone(accountId: string, phone: string) {
  const tail = phone.replace(/\D/g, "").slice(-10);
  const all = await db.select({ phone: sellers.phone }).from(sellers).where(eq(sellers.accountId, accountId));
  return all.some((s) => s.phone && s.phone.replace(/\D/g, "").slice(-10) === tail);
}

async function handleIncomingMessage(accountId: string, msg: any) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (isIgnoredJid(phoneJid)) return;
    const extracted = extractText(msg.message);
    if (!extracted) return;
    const pushName: string | null = msg.pushName || null;
    const phone = phoneFromKey(msg.key);

    if (phone && (await isSellerPhone(accountId, phone))) return; // vendedor da equipe não vira lead

    if (msg.key.id) {
      const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, msg.key.id) });
      if (dup) return;
    }

    let conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
    if (!conversation) {
      const [created] = await db
        .insert(conversations)
        .values({ accountId, phoneJid, leadName: pushName || "Lead", lastMessageAt: new Date() })
        .onConflictDoNothing()
        .returning();
      conversation =
        created ||
        (await db.query.conversations.findFirst({
          where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
        }));
    } else if (pushName && (!conversation.leadName || conversation.leadName === "Lead")) {
      await db.update(conversations).set({ leadName: pushName }).where(eq(conversations.id, conversation.id));
    }
    if (!conversation) return;

    const existingLead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversation.id) });
    if (!existingLead) {
      await db
        .insert(leads)
        .values({ accountId, conversationId: conversation.id, cardName: pushName || "Lead", phone, stage: "FIRST_CONTACT" })
        .onConflictDoNothing();
    } else if (phone && !existingLead.phone) {
      await db.update(leads).set({ phone }).where(eq(leads.id, existingLead.id));
    }

    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "IN",
      body: extracted.text,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      sender: "LEAD",
    });
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.conversationId, conversation.id));

    console.log(`[Mensagem ${accountId.slice(0, 8)}] ${phoneJid}: "${extracted.text.slice(0, 60)}"`);

    const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
    if (settings?.enabled) scheduleAi(accountId, conversation.id);
  } catch (error) {
    console.error("[Error] handleIncomingMessage:", error);
  }
}

/** IDs de mensagens enviadas por este motor (para não confundir com mensagens digitadas no celular) */
const recentSentIds: string[] = [];
function rememberSent(id: string) {
  recentSentIds.push(id);
  if (recentSentIds.length > 1000) recentSentIds.shift();
}

/** Alguém respondeu pelo celular da empresa: registra e pausa a IA desse lead */
async function handleOwnPhoneMessage(accountId: string, msg: any) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (isIgnoredJid(phoneJid) || !msg.key.id || recentSentIds.includes(msg.key.id)) return;
    const extracted = extractText(msg.message);
    if (!extracted) return;
    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
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
    await db.update(leads).set({ aiPaused: true, updatedAt: new Date() }).where(eq(leads.conversationId, conversation.id));
  } catch (error) {
    console.error("[Error] handleOwnPhoneMessage:", error);
  }
}

/** Envia texto pelo WhatsApp da conta e registra no histórico */
async function sendText(accountId: string, phoneJid: string, text: string, sender: Sender) {
  const s = sessions.get(accountId);
  if (!s?.sock || s.state !== "connected") return { error: "WhatsApp desta conta não está conectado" };
  try {
    const response = await s.sock.sendMessage(phoneJid, { text });
    if (response?.key?.id) rememberSent(response.key.id);
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
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
    return { success: true, messageId: response?.key?.id };
  } catch (error) {
    console.error("[Error] sendText:", error);
    return { error: String(error) };
  }
}

// ============================================================================
// IA (SDR)
// ============================================================================

const aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
const aiRunning = new Set<string>();
const warned = new Set<string>();

function scheduleAi(accountId: string, conversationId: string) {
  const current = aiTimers.get(conversationId);
  if (current) clearTimeout(current);
  aiTimers.set(
    conversationId,
    setTimeout(() => {
      aiTimers.delete(conversationId);
      if (aiRunning.has(conversationId)) {
        scheduleAi(accountId, conversationId);
        return;
      }
      aiRunning.add(conversationId);
      runAi(accountId, conversationId)
        .catch((err) => console.error("[IA] Erro:", err?.message || err))
        .finally(() => aiRunning.delete(conversationId));
    }, AI_DEBOUNCE_MS)
  );
}

function sellerJid(phone: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `${d.length <= 11 ? "55" + d : d}@s.whatsapp.net`;
}

async function loadAccount(id: string) {
  return db.query.accounts.findFirst({ where: eq(accounts.id, id) });
}

async function runAi(accountId: string, conversationId: string) {
  const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
  if (!settings?.enabled) return;

  const key = await resolveAiKey(accountId, loadAccount);
  if (!key.apiKey) {
    if (!warned.has(accountId)) console.warn(`[IA ${accountId.slice(0, 8)}] sem chave de IA (${key.reason}) — não vou responder`);
    warned.add(accountId);
    return;
  }

  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  const lead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
  if (!conversation || !lead) return;
  if (lead.aiPaused || lead.sellerId || lead.stage === "SALE") return;

  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
    limit: 30,
  });
  const history = recent.reverse();
  if (!history.length || history[history.length - 1].direction !== "IN") return;

  const allTags = await db.select().from(tags).where(eq(tags.accountId, accountId));
  const rules = await db.query.distributionRules.findMany({
    where: eq(schema.distributionRules.accountId, accountId),
    with: { seller: true },
  });

  // Agenda: horários ocupados e o agendamento atual do lead
  const now = new Date();
  const busyRows = await db
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.accountId, accountId),
        eq(appointments.status, "SCHEDULED"),
        gte(appointments.startsAt, now),
        lt(appointments.startsAt, new Date(now.getTime() + 21 * 864e5))
      )
    )
    .orderBy(appointments.startsAt)
    .limit(40);
  const currentAppt = await db.query.appointments.findFirst({
    where: and(eq(appointments.leadId, lead.id), eq(appointments.status, "SCHEDULED"), gte(appointments.startsAt, now)),
    orderBy: (a, { asc }) => asc(a.startsAt),
  });

  const decision = await runSdrAgent(
    {
      systemPrompt: settings.systemPrompt || "Você é a atendente virtual da empresa.",
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
      scheduling: {
        enabled: settings.schedulingEnabled,
        businessHours: settings.businessHours,
        busy: busyRows.map((b) => `${formatSpDate(b.startsAt).slice(0, 5)} às ${formatSpTime(b.startsAt)}`),
        current: currentAppt
          ? `${currentAppt.title} em ${formatSpDate(currentAppt.startsAt)} às ${formatSpTime(currentAppt.startsAt)}`
          : null,
      },
    },
    { apiKey: key.apiKey, model: settings.model || "claude-sonnet-4-5", baseUrl: process.env.ANTHROPIC_BASE_URL }
  );
  if (!decision) return;

  // Uma pessoa assumiu enquanto a IA pensava? Não responde por cima.
  const fresh = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
  if (!fresh || fresh.aiPaused || fresh.sellerId) return;
  const newest = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
  });
  if (newest && newest.id !== history[history.length - 1].id && newest.direction === "IN") {
    scheduleAi(accountId, conversationId);
    return;
  }

  await applyDecision(accountId, lead.id, conversationId, decision, allTags);
  if (decision.appointment && settings.schedulingEnabled) {
    await saveAiAppointment(accountId, lead.id, decision, settings, currentAppt?.id || null);
  }

  const parts = decision.reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await pause(1200);
    await sendText(accountId, conversation.phoneJid, parts[i], "AI");
  }

  if (decision.handoff) {
    await handoffToSeller(accountId, lead.id, conversation.phoneJid, conversation.leadName, decision, settings, rules);
  }
  console.log(
    `[IA ${accountId.slice(0, 8)}] ${conversation.phoneJid} — nota ${decision.score}` +
      `${decision.appointment ? " — agendou" : ""}${decision.handoff ? " — transferido" : ""}`
  );
}

async function applyDecision(
  accountId: string,
  leadId: string,
  conversationId: string,
  d: AgentDecision,
  allTags: { id: string; name: string }[]
) {
  const current = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!current) return;
  const order = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"];
  // O estágio só avança (a IA não rebaixa um lead que alguém moveu para frente)
  let stage = order.indexOf(d.stage) > order.indexOf(current.stage) || !order.includes(current.stage) ? d.stage : current.stage;
  if ((d.handoff || d.appointment) && order.indexOf(stage) < order.indexOf("HOT_LEAD")) stage = "HOT_LEAD";

  const set: Record<string, unknown> = {
    stage,
    score: d.score,
    aiSummary: d.summary || current.aiSummary,
    updatedAt: new Date(),
  };
  if (d.city) set.city = d.city;
  if (d.interest) set.interest = d.interest;
  if (d.saleType !== "ANY") set.saleType = d.saleType;
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (d.name && (!current.cardName || current.cardName === "Lead" || current.cardName === conv?.leadName)) {
    set.cardName = d.name;
    await db.update(conversations).set({ leadName: d.name }).where(eq(conversations.id, conversationId));
  }
  await db.update(leads).set(set).where(eq(leads.id, leadId));

  for (const name of d.tags) {
    const tag = allTags.find((t) => t.name === name);
    if (tag) await db.insert(leadTags).values({ leadId, tagId: tag.id }).onConflictDoNothing();
  }
}

async function saveAiAppointment(
  accountId: string,
  leadId: string,
  d: AgentDecision,
  settings: { reminderMessage: string | null; reminderMinutesBefore: number },
  existingId: string | null
) {
  if (!d.appointment) return;
  const startsAt = fromSpDateTime(d.appointment.date, d.appointment.time);
  if (!startsAt || startsAt.getTime() < Date.now() - 5 * 60e3) {
    console.warn(`[IA ${accountId.slice(0, 8)}] horário inválido/passado ignorado:`, d.appointment);
    return;
  }
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (existingId) {
    const existing = await db.query.appointments.findFirst({ where: eq(appointments.id, existingId) });
    if (existing && existing.startsAt.getTime() === startsAt.getTime()) return; // já está marcado
    await db
      .update(appointments)
      .set({ startsAt, title: d.appointment.subject, reminderSentAt: null, reminderError: null, updatedAt: new Date() })
      .where(eq(appointments.id, existingId));
    return;
  }
  await db.insert(appointments).values({
    accountId,
    leadId,
    sellerId: lead?.sellerId || null,
    title: d.appointment.subject,
    notes: d.summary || null,
    startsAt,
    reminderMessage: settings.reminderMessage,
    reminderMinutesBefore: settings.reminderMinutesBefore,
    createdBy: "AI",
  });
}

async function handoffToSeller(
  accountId: string,
  leadId: string,
  leadJid: string,
  leadName: string | null,
  d: AgentDecision,
  settings: { handoffMessage: string | null; notifySeller: boolean },
  rules: {
    region: string | null;
    saleType: "ANY" | "WHOLESALE" | "RETAIL";
    priority: number;
    active: boolean;
    sellerId: string;
    seller: { active: boolean } | null;
  }[]
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
  if (seller) {
    await db
      .update(appointments)
      .set({ sellerId: seller.id })
      .where(and(eq(appointments.leadId, leadId), isNull(appointments.sellerId)));
  }

  const template = settings.handoffMessage ?? "";
  if (template.trim()) {
    await pause(1200);
    await sendText(accountId, leadJid, fillTemplate(template, { vendedor: seller?.name || "um de nossos consultores" }), "AI");
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
        d.appointment ? `*Agendado:* ${d.appointment.subject} em ${d.appointment.date.split("-").reverse().join("/")} às ${d.appointment.time}` : null,
        `*Nota:* ${d.score}/100`,
        d.summary ? `\n${d.summary}` : null,
        leadPhone ? `\nFalar com o cliente: https://wa.me/${leadPhone}` : `\nAbra o painel em Leads para continuar.`,
      ].filter(Boolean);
      const r = await sendText(accountId, jid, lines.join("\n"), "AI");
      if ("error" in r) console.warn("[IA] Não consegui avisar o vendedor:", r.error);
    }
  }
}

// ============================================================================
// LEMBRETES DA AGENDA
// ============================================================================

let remindersRunning = false;

async function processReminders() {
  if (remindersRunning) return;
  remindersRunning = true;
  try {
    const now = new Date();
    // Agendamentos com lembrete pendente cujo horário de aviso já chegou (até 6h de atraso)
    const due = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.status, "SCHEDULED"),
          eq(appointments.reminderEnabled, true),
          isNull(appointments.reminderSentAt),
          sql`${appointments.startsAt} - make_interval(mins => ${appointments.reminderMinutesBefore}) <= ${now}`,
          gte(appointments.startsAt, new Date(now.getTime() - 6 * 3600e3))
        )
      )
      .limit(50);

    for (const appt of due) {
      if (!appt.leadId) {
        await db.update(appointments).set({ reminderSentAt: now, reminderError: "Sem cliente vinculado" }).where(eq(appointments.id, appt.id));
        continue;
      }
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, appt.leadId), with: { conversation: true } });
      if (!lead?.conversation) continue;
      const session = sessions.get(appt.accountId);
      if (!session || session.state !== "connected") {
        if (appt.reminderError !== "WhatsApp desconectado") {
          await db.update(appointments).set({ reminderError: "WhatsApp desconectado" }).where(eq(appointments.id, appt.id));
        }
        continue; // tenta de novo na próxima rodada
      }
      const seller = appt.sellerId ? await db.query.sellers.findFirst({ where: eq(sellers.id, appt.sellerId) }) : null;
      const name = lead.cardName && lead.cardName !== "Lead" ? lead.cardName : lead.conversation.leadName || "";
      const text = fillTemplate(
        appt.reminderMessage ||
          "Olá, {nome}! Passando para lembrar do nosso compromisso: {assunto} em {data} às {hora}. Até já! 😊",
        {
          nome: name.split(" ")[0] || "",
          data: formatSpDate(appt.startsAt),
          hora: formatSpTime(appt.startsAt),
          assunto: appt.title,
          vendedor: seller?.name || "",
        }
      ).replace(/\s+([!,.])/g, "$1");
      const r = await sendText(appt.accountId, lead.conversation.phoneJid, text, "AUTO");
      if ("error" in r) {
        await db.update(appointments).set({ reminderError: String(r.error).slice(0, 300) }).where(eq(appointments.id, appt.id));
      } else {
        await db.update(appointments).set({ reminderSentAt: new Date(), reminderError: null }).where(eq(appointments.id, appt.id));
        console.log(`[Agenda ${appt.accountId.slice(0, 8)}] lembrete enviado: ${appt.title}`);
      }
    }
  } catch (err) {
    console.error("[Agenda] erro nos lembretes:", err);
  } finally {
    remindersRunning = false;
  }
}

// ============================================================================
// API INTERNA (usada pelo site)
// ============================================================================

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
  } catch {
    return {};
  }
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function statusOf(accountId: string) {
  const s = sessions.get(accountId);
  const state = s?.state || "idle";
  return {
    state,
    connected: state === "connected",
    phone: s?.phone || null,
    qrDataUrl: s?.qr ? await QRCode.toDataURL(s.qr, { width: 320 }) : null,
  };
}

async function validAccount(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return loadAccount(id);
}

function startApiServer() {
  const port = Number(process.env.PORT || process.env.FLOW_ENGINE_PORT || 3001);
  const token = process.env.FLOW_ENGINE_TOKEN || process.env.QR_ACCESS_TOKEN;

  http
    .createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          return res.end("ok");
        }
        if (token && req.headers["x-internal-token"] !== token) return json(res, 401, { error: "unauthorized" });

        if (url.pathname === "/status.json") {
          const acc = await validAccount(url.searchParams.get("account"));
          if (!acc) return json(res, 400, { error: "Conta inválida" });
          return json(res, 200, await statusOf(acc.id));
        }

        if (req.method !== "POST") return json(res, 404, { error: "not found" });
        const body = await readBody(req);

        if (SELFTEST && url.pathname === "/__test/incoming") {
          const acc = await validAccount(body.accountId);
          if (!acc) return json(res, 400, { error: "Conta inválida" });
          if (body.msg?.key?.fromMe) await handleOwnPhoneMessage(acc.id, body.msg);
          else await handleIncomingMessage(acc.id, body.msg);
          return json(res, 200, {});
        }
        if (SELFTEST && url.pathname === "/__test/reminders") {
          await processReminders();
          return json(res, 200, {});
        }

        const acc = await validAccount(body.accountId);
        if (!acc) return json(res, 400, { error: "Conta inválida" });

        if (url.pathname === "/connect") {
          const s = getSession(acc.id);
          if (s.state === "idle") {
            s.qrCount = 0;
            await startSession(acc.id);
            // espera um pouco pelo primeiro QR
            for (let i = 0; i < 20 && getSession(acc.id).state === "starting"; i++) await pause(300);
          }
          return json(res, 200, await statusOf(acc.id));
        }
        if (url.pathname === "/logout") {
          await stopSession(acc.id, true);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/send") {
          if (!body.phoneJid || !body.text) return json(res, 400, { error: "phoneJid e text são obrigatórios" });
          const sender: Sender = body.sender === "AI" ? "AI" : body.sender === "AUTO" ? "AUTO" : "HUMAN";
          const r = await sendText(acc.id, body.phoneJid, String(body.text), sender);
          return json(res, "error" in r ? 502 : 200, r);
        }
        return json(res, 404, { error: "not found" });
      } catch (err) {
        console.error("[API] erro:", err);
        return json(res, 500, { error: String(err) });
      }
    })
    .listen(port, () => console.log(`[API] motor ouvindo na porta ${port}`));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("🚀 Motor do WhatsApp iniciando (multiempresa)...");
  startApiServer();
  await syncSessions();
  setInterval(() => syncSessions().catch((e) => console.error("[sync]", e)), 60_000);
  setInterval(() => processReminders(), SELFTEST ? 3_000 : 30_000);

  const shutdown = async () => {
    console.log("\n🛑 Encerrando motor...");
    for (const s of sessions.values()) {
      s.stopping = true;
      try {
        s.sock?.end(undefined);
      } catch {}
    }
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("❌ Erro ao iniciar o motor:", err);
  process.exit(1);
});

// Evita derrubar o motor inteiro por um erro isolado de uma conta
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

