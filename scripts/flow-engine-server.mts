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
  downloadMediaMessage,
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
  products,
  productCategories,
  productImages,
  metaConnections,
  funnelColumns,
  funnels,
  chatbots,
  followupSettings,
  waNumbers,
  agentEvents,
  aiUsage,
  broadcasts,
  broadcastRecipients,
  driveFiles,
} from "../src/db/schema";
import { eq, and, desc, gte, lt, lte, isNull, sql, inArray } from "drizzle-orm";
import { inWindow, renderMessage } from "../src/lib/broadcast/common";
import { WHATSAPP_VIDEO_MAX } from "../src/lib/drive/common";
import { runSdrAgent, type AgentDecision } from "../src/lib/ai/sdrAgent";
import { resolveAiKey, resolveVoiceKey } from "../src/lib/tenancy/aiKey";
import { transcribeAudio, synthesizeSpeech } from "../src/lib/voice/providers";
import {
  metaChannelOf,
  metaUserId,
  CHANNEL_PREFIX,
  plainForMeta,
  splitForMeta,
  sendMetaText,
  sendMetaAttachment,
  metaProfile,
  downloadMetaFile,
  publicFileUrl,
  type MetaChannel,
} from "../src/lib/meta/graph";
import { decryptSecret } from "../src/lib/tenancy/secret";
import {
  priceLabel,
  installmentRows,
  installmentText,
  effectiveAvailability,
  availabilityText,
  kindPriceLabel,
  kindDetails,
  KIND_LABEL,
  pickProductImage,
  productCaption,
} from "../src/lib/products/format";
import { ensureColumns, ensureFunnels } from "../src/lib/funnel/shared";
import { ensureActions, type AiAction } from "../src/lib/actions/shared";
import { normalizeStage } from "../src/lib/funnel/common";
import { listChatbots, accountHasModule } from "../src/lib/chatbot/shared";
import {
  matchOption,
  matchKeyword,
  renderStep,
  fillBotText,
  DEFAULT_FALLBACK,
  type Chatbot,
  type BotOption,
} from "../src/lib/chatbot/common";
import { followupCandidates, ensureDisqualifiedColumn, type FollowupCandidate } from "../src/lib/followup/shared";
import { withDefaults, fillName, type FollowupSettings } from "../src/lib/followup/common";
import { generateFollowup } from "../src/lib/ai/followup";
import { replyDelayMs, typingMs } from "../src/lib/ai/style";
import { normalizeSellerHours, sellerAvailability, DEFAULT_AFTER_HOURS } from "../src/lib/ai/hours";
import { normalizeQualify, qualifyPending, isQualified, maskCatalogItem, mergeQualifyData, missingForHandoff, onlyHandoff, type QualifyData } from "../src/lib/ai/qualify";
import { sellerPool, chooseSeller, type RotationState } from "../src/lib/ai/distribution";
import { loadCatalogFor } from "../src/lib/ai/catalog";
import { normalizeWaConfig, type WaNumberConfig } from "../src/lib/whatsapp/config";
import { ensureAgents, pickAgent } from "../src/lib/agents/shared";
import { agentSystemPrompt, restrictCatalogItem, restrictDecision, agentByKeyword, agentScope } from "../src/lib/agents/common";
import { routeWithAi } from "../src/lib/ai/router";
import type { Usage } from "../src/lib/ai/usage";
import { storageReady, getObject, signedUrl } from "../src/lib/storage/s3";
import { fromSpDateTime, formatSpDate, formatSpTime, fillTemplate } from "../src/lib/time";
import * as dotenv from "dotenv";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

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

type Sender = "AI" | "HUMAN" | "AUTO" | "BOT" | "FOLLOWUP" | "BROADCAST";

/** Espera um pouco antes do chatbot responder, para juntar mensagens seguidas */
const BOT_DEBOUNCE_MS = Number(process.env.BOT_DEBOUNCE_MS || 1500);

/** Mídia maior que isso não é guardada no banco (só o aviso "[vídeo]" etc.) */
const MAX_STORED_MEDIA = 12 * 1024 * 1024;
/** Mensagens recuperadas depois de uma queda: a IA só responde se forem recentes */
const AI_RECOVERY_WINDOW_MS = 12 * 3600e3;
type Sock = ReturnType<typeof makeWASocket>;

interface Session {
  accountId: string;
  /** Qual WhatsApp da conta: 1 (principal), 2 ou 3 */
  slot: number;
  sock: Sock | null;
  state: "starting" | "qr" | "connected" | "idle";
  phone: string | null;
  qr: string | null;
  qrCount: number;
  stopping: boolean;
  /** Desde quando está caído tentando reconectar */
  downSince: number | null;
}

const sessions = new Map<string, Session>();
/** Chave da sessão: o WhatsApp 1 usa só o id da conta (como sempre foi); o 2 e o 3 ganham "#2"/"#3" */
const skey = (accountId: string, slot = 1) => (slot > 1 ? `${accountId}#${slot}` : accountId);
/** Chave no wa_auth: o 1 continua igual; o 2 e o 3 com prefixo "s2:"/"s3:" */
const authKey = (slot: number, key: string) => (slot > 1 ? `s${slot}:${key}` : key);
const MAX_SLOTS = 3;
/** Quantos WhatsApps a conta pode ter (o Master pode os 3) */
const slotsOf = (a: { type: string; maxWhatsapp: number | null }) => (a.type === "MASTER" ? MAX_SLOTS : Math.max(1, Math.min(MAX_SLOTS, a.maxWhatsapp || 1)));

/** Sessão conectada da conta: prefere o número pedido; senão o primeiro conectado (1, 2, 3) */
function connectedSession(accountId: string, slot?: number | null) {
  if (slot) {
    const s = sessions.get(skey(accountId, slot));
    if (s?.sock && s.state === "connected") return s;
  }
  for (let n = 1; n <= MAX_SLOTS; n++) {
    const s = sessions.get(skey(accountId, n));
    if (s?.sock && s.state === "connected") return s;
  }
  return undefined;
}

/** Regras próprias de cada WhatsApp da conta (produtos, vendedores, funil, orientação da IA) — cache de 30s */
const waCfgCache = new Map<string, { at: number; cfg: WaNumberConfig }>();
async function numberConfig(accountId: string, slot: number | null | undefined) {
  const n = slot || 1;
  const k = skey(accountId, n);
  const hit = waCfgCache.get(k);
  if (hit && Date.now() - hit.at < 30e3) return hit.cfg;
  const row = await db.query.waNumbers.findFirst({ where: and(eq(waNumbers.accountId, accountId), eq(waNumbers.slot, n)), columns: { config: true } });
  const cfg = normalizeWaConfig(row?.config);
  waCfgCache.set(k, { at: Date.now(), cfg });
  return cfg;
}

/** Regras do WhatsApp em que a conversa com este contato está */
async function configForJid(accountId: string, phoneJid: string) {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    columns: { waSlot: true, channel: true },
  });
  if (conv && conv.channel !== "WHATSAPP") return normalizeWaConfig(null);
  return numberConfig(accountId, conv?.waSlot);
}

/** Histórico dos Agentes de IA no lead (não trava o atendimento se falhar) */
async function logAgentEvent(
  accountId: string,
  leadId: string,
  agent: { id: string; name: string } | null,
  kind: string,
  detail: string | null,
  meta?: Record<string, unknown>
) {
  await db
    .insert(agentEvents)
    .values({ accountId, leadId, agentId: agent?.id || null, agentName: agent?.name || null, kind, detail: detail?.slice(0, 500) || null, meta: meta || null })
    .catch((e) => console.warn("[Agentes] histórico:", (e as Error)?.message || e));
}

/** Consumo de IA (tokens) por conta/agente/modelo */
async function logUsage(accountId: string, agentId: string | null, model: string, kind: string, u: Usage | null | undefined) {
  if (!u) return;
  await db
    .insert(aiUsage)
    .values({ accountId, agentId, model: model.slice(0, 80), kind, inputTokens: u.input, outputTokens: u.output })
    .catch((e) => console.warn("[Consumo] ", (e as Error)?.message || e));
}

/** Por qual WhatsApp falar com este contato: o número em que a conversa está */
async function sessionFor(accountId: string, phoneJid: string) {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    columns: { waSlot: true },
  });
  const own = sessions.get(skey(accountId, conv?.waSlot || 1));
  // O número da conversa está em uso (conectado ou reconectando): só ele, para o cliente não receber de outro número
  if (own && own.state !== "idle") return own.sock && own.state === "connected" ? own : undefined;
  return connectedSession(accountId);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// SESSÃO DO WHATSAPP GUARDADA NO BANCO
// ============================================================================

async function readAuth(accountId: string, key: string, slot = 1) {
  key = authKey(slot, key);
  const row = await db.query.waAuth.findFirst({ where: and(eq(waAuth.accountId, accountId), eq(waAuth.key, key)) });
  return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
}

async function writeAuth(accountId: string, key: string, value: unknown, slot = 1) {
  key = authKey(slot, key);
  const json = JSON.stringify(value, BufferJSON.replacer);
  await db
    .insert(waAuth)
    .values({ accountId, key, value: json })
    .onConflictDoUpdate({ target: [waAuth.accountId, waAuth.key], set: { value: json } });
}

async function removeAuth(accountId: string, key: string, slot = 1) {
  key = authKey(slot, key);
  await db.delete(waAuth).where(and(eq(waAuth.accountId, accountId), eq(waAuth.key, key)));
}

async function clearAuth(accountId: string, slot = 1) {
  const mine = slot > 1 ? sql`${waAuth.key} LIKE ${`s${slot}:%`}` : sql`${waAuth.key} !~ '^s[0-9]:'`;
  await db.delete(waAuth).where(and(eq(waAuth.accountId, accountId), mine));
}

async function useDbAuthState(accountId: string, slot = 1): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const creds = (await readAuth(accountId, "creds", slot)) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readAuth(accountId, `${type}-${id}`, slot);
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
              tasks.push(value ? writeAuth(accountId, key, value, slot) : removeAuth(accountId, key, slot));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeAuth(accountId, "creds", creds, slot),
  };
}

async function hasSavedLogin(accountId: string, slot = 1) {
  const creds = await readAuth(accountId, "creds", slot);
  return Boolean(creds?.registered || creds?.me?.id);
}

// ============================================================================
// SITUAÇÃO DO WHATSAPP (gravada no banco para o painel mostrar avisos)
// ============================================================================

async function setWaState(accountId: string, state: string, phone: string | null, slot = 1) {
  try {
    if (slot > 1) {
      const set: Record<string, unknown> = { state, stateAt: new Date() };
      if (phone) set.phone = phone;
      if (state === "connected") set.lastSeenAt = new Date();
      await db.update(waNumbers).set(set).where(and(eq(waNumbers.accountId, accountId), eq(waNumbers.slot, slot)));
      return;
    }
    const set: Record<string, unknown> = { waState: state, waStateAt: new Date() };
    if (phone) set.waPhone = phone;
    if (state === "connected") set.waLastSeenAt = new Date();
    await db.update(accounts).set(set).where(eq(accounts.id, accountId));
  } catch (e) {
    console.error("[WhatsApp] setWaState:", e);
  }
}

async function touchLastSeen(accountId: string, slot = 1) {
  if (slot > 1) {
    await db.update(waNumbers).set({ lastSeenAt: new Date() }).where(and(eq(waNumbers.accountId, accountId), eq(waNumbers.slot, slot))).catch(() => {});
    return;
  }
  await db.update(accounts).set({ waLastSeenAt: new Date() }).where(eq(accounts.id, accountId)).catch(() => {});
}

async function getLastSeen(accountId: string, slot = 1) {
  if (slot > 1) {
    const n = await db.query.waNumbers.findFirst({ where: and(eq(waNumbers.accountId, accountId), eq(waNumbers.slot, slot)), columns: { lastSeenAt: true } });
    return n?.lastSeenAt || null;
  }
  const a = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { waLastSeenAt: true } });
  return a?.waLastSeenAt || null;
}

/** Contas que já receberam alerta desta queda (evita mandar vários) */
const alertSent = new Set<string>();

/** Avisa por WhatsApp que o número de uma conta caiu, usando o WhatsApp da conta acima (parceiro/master) */
async function sendDisconnectAlert(accountId: string, loggedOut: boolean, slot = 1) {
  if (alertSent.has(skey(accountId, slot))) return;
  alertSent.add(skey(accountId, slot));
  try {
    const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
    if (!acc) return;
    const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
    const target = (settings?.alertPhone || acc.phone || "").replace(/\D/g, "");
    // Procura uma conta acima com WhatsApp conectado para enviar o alerta
    let senderId: string | null = acc.parentId;
    let senderSession: Session | undefined;
    for (let i = 0; senderId && i < 6; i++) {
      const sess = connectedSession(senderId);
      if (sess) {
        senderSession = sess;
        break;
      }
      const parent = await db.query.accounts.findFirst({ where: eq(accounts.id, senderId), columns: { parentId: true } });
      senderId = parent?.parentId || null;
    }
    if (!senderSession?.sock || target.length < 10) {
      console.log(`[Alerta] ${acc.name}: WhatsApp caiu, mas não há como avisar por WhatsApp (sem telefone de alerta ou sem conta acima conectada)`);
      return;
    }
    const jid = `${target.length <= 11 ? "55" + target : target}@s.whatsapp.net`;
    const which = slot > 1 ? ` (WhatsApp ${slot})` : "";
    const text = loggedOut
      ? `⚠️ *${acc.name}*${which}: o WhatsApp foi desconectado do sistema (saiu pelo celular). A IA e os lembretes pararam. Entre no painel → WhatsApp → Gerar QR Code e leia com o celular da empresa.`
      : `⚠️ *${acc.name}*${which}: o WhatsApp está sem conexão com o sistema há alguns minutos. Verifique se o celular da empresa está ligado e com internet. Se não voltar sozinho, entre no painel → WhatsApp.`;
    const r = await senderSession.sock.sendMessage(jid, { text });
    if (r?.key?.id) rememberSent(r.key.id);
    console.log(`[Alerta] enviado para ${target} sobre ${acc.name}`);
  } catch (e) {
    console.error("[Alerta] falhou:", e);
  }
}

// ============================================================================
// CONEXÕES (UMA POR CONTA)
// ============================================================================

function getSession(accountId: string, slot = 1): Session {
  let s = sessions.get(skey(accountId, slot));
  if (!s) {
    s = { accountId, slot, sock: null, state: "idle", phone: null, qr: null, qrCount: 0, stopping: false, downSince: null };
    sessions.set(skey(accountId, slot), s);
  }
  return s;
}

async function startSession(accountId: string, slot = 1) {
  const s = getSession(accountId, slot);
  const tag = `${accountId.slice(0, 8)}${slot > 1 ? "#" + slot : ""}`;
  if (s.sock && s.state !== "idle") return s;
  s.stopping = false;
  s.state = "starting";
  s.qr = null;

  if (SELFTEST) {
    s.sock = {
      sendMessage: async (jid: string, content: any) => {
        console.log(`[SELFTEST ${tag}] -> ${jid}: ${content?.text ?? (content?.image ? `[foto ${content.image.length}b] ${content.caption || ""}` : "[mídia]")}`);
        return { key: { id: "TEST" + Math.random().toString(36).slice(2) } };
      },
      sendPresenceUpdate: async (kind: string, jid: string) => {
        console.log(`[SELFTEST ${tag}] presença ${kind} -> ${jid}`);
      },
      groupFetchAllParticipating: async () => ({
        "120363000000000001@g.us": { id: "120363000000000001@g.us", subject: "Equipe Resplen", participants: [1, 2, 3] },
        "120363000000000002@g.us": { id: "120363000000000002@g.us", subject: "Clientes VIP", participants: [1, 2, 3, 4, 5] },
      }),
      onWhatsApp: async (phone: string) => [{ exists: !phone.endsWith("0000"), jid: `${phone}@s.whatsapp.net` }],
      groupMetadata: async (jid: string) => ({ id: jid, subject: jid.endsWith("1@g.us") ? "Equipe Resplen" : "Clientes VIP" }),
      end: () => {},
      logout: async () => {},
    } as unknown as Sock;
    s.state = "connected";
    s.phone = "55000" + accountId.replace(/\D/g, "").slice(0, 7) + slot;
    await setWaState(accountId, "connected", s.phone, slot);
    return s;
  }

  const { state, saveCreds } = await useDbAuthState(accountId, slot);
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
      console.log(`[WhatsApp ${tag}] QR Code gerado (${s.qrCount})`);
    }
    if (connection === "open") {
      s.state = "connected";
      s.qr = null;
      s.qrCount = 0;
      s.phone = sock.user?.id?.split(":")[0] || null;
      s.downSince = null;
      console.log(`✅ [WhatsApp ${tag}] conectado: ${s.phone}`);
      await setWaState(accountId, "connected", s.phone, slot);
      alertSent.delete(skey(accountId, slot));
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const wasConnected = s.state === "connected";
      s.sock = null;
      s.phone = null;
      if (wasConnected) await touchLastSeen(accountId, slot);
      if (s.stopping) {
        s.state = "idle";
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        console.log(`[WhatsApp ${tag}] desconectado pelo celular`);
        await clearAuth(accountId, slot);
        s.state = "idle";
        s.qr = null;
        await setWaState(accountId, "logged_out", null, slot);
        await sendDisconnectAlert(accountId, true, slot);
        return;
      }
      if (wasConnected || !s.downSince) {
        s.downSince = s.downSince || Date.now();
        await setWaState(accountId, "reconnecting", null, slot);
      }
      // QR expirou sem ninguém ler: para (a pessoa clica em "Gerar QR Code" de novo)
      if (!(await hasSavedLogin(accountId, slot)) && s.qrCount >= 5) {
        console.log(`[WhatsApp ${tag}] QR expirou sem leitura — aguardando novo pedido`);
        await setWaState(accountId, "idle", null, slot);
        s.state = "idle";
        s.qr = null;
        s.qrCount = 0;
        return;
      }
      s.state = "starting";
      setTimeout(() => startSession(accountId, slot).catch((e) => console.error("[WhatsApp] reconexão:", e)), 3000);
    }
  });

  // Momento a partir do qual mensagens "atrasadas" (chegaram com o motor fora do ar) são recuperadas
  const recoverFrom = await getLastSeen(accountId, slot);

  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages) {
      if (m.type !== "notify") {
        // "append" = mensagens entregues depois de uma queda/reconexão.
        // Só recupera o que chegou depois da última vez que o motor estava conectado.
        const ts = Number(msg.messageTimestamp || 0) * 1000;
        if (!recoverFrom || !ts || ts < recoverFrom.getTime() - 120e3) continue;
      }
      if (msg.key.fromMe) await handleOwnPhoneMessage(accountId, msg, slot);
      else await handleIncomingMessage(accountId, msg, slot);
    }
  });

  return s;
}

async function stopSession(accountId: string, logout: boolean, slot = 1) {
  const s = getSession(accountId, slot);
  s.stopping = true;
  try {
    if (logout) await s.sock?.logout().catch(() => {});
    s.sock?.end(undefined);
  } catch {}
  s.sock = null;
  s.state = "idle";
  s.qr = null;
  s.phone = null;
  s.downSince = null;
  if (logout) await clearAuth(accountId, slot);
  await setWaState(accountId, "idle", null, slot);
}

/** Reabre as conexões salvas (ao iniciar e de tempos em tempos) */
async function syncSessions() {
  // Marca "visto por último" das contas conectadas e avisa quedas longas (> 5 min)
  for (const s of sessions.values()) {
    if (s.state === "connected" && !SELFTEST) await touchLastSeen(s.accountId, s.slot);
    if (s.downSince && Date.now() - s.downSince > 5 * 60e3) await sendDisconnectAlert(s.accountId, false, s.slot);
  }
  // WhatsApps 2 e 3: só dentro do limite da conta (se o limite baixou, a conexão extra é encerrada)
  const extra = await db
    .select({ accountId: waNumbers.accountId, slot: waNumbers.slot, enabled: waNumbers.enabled, type: accounts.type, maxWhatsapp: accounts.maxWhatsapp, active: accounts.active })
    .from(waNumbers)
    .innerJoin(accounts, eq(accounts.id, waNumbers.accountId));
  for (const n of extra) {
    if (n.slot < 2) continue; // a linha do WhatsApp 1 só guarda as regras dele
    const allowed = n.enabled && n.active && n.slot >= 2 && n.slot <= slotsOf(n);
    const s = getSession(n.accountId, n.slot);
    if (!allowed) {
      if (s.sock) {
        console.log(`[WhatsApp ${n.accountId.slice(0, 8)}#${n.slot}] fora do limite da conta — encerrando`);
        await stopSession(n.accountId, false, n.slot);
      }
      continue;
    }
    if (s.state === "idle" && !s.sock && (SELFTEST || (await hasSavedLogin(n.accountId, n.slot)))) {
      console.log(`[WhatsApp ${n.accountId.slice(0, 8)}#${n.slot}] reabrindo sessão salva`);
      await startSession(n.accountId, n.slot).catch((e) => console.error("[WhatsApp] start:", e));
      await pause(500);
    }
  }
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

/** Tipos de mídia que baixamos e guardamos para mostrar no painel */
const MEDIA_KINDS: Record<string, string> = {
  imageMessage: "image",
  audioMessage: "audio",
  videoMessage: "video",
  documentMessage: "document",
  stickerMessage: "sticker",
};

function unwrap(message: any) {
  return (
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message
  );
}

/** Baixa a mídia (áudio, foto, vídeo, documento) e devolve como data URL para guardar */
async function downloadMedia(accountId: string, msg: any, slot = 1) {
  if (SELFTEST && msg.__testMedia) return msg.__testMedia; // só no teste local
  const m = unwrap(msg.message);
  const key = Object.keys(MEDIA_KINDS).find((k) => m?.[k]);
  if (!key) return null;
  const info = m[key];
  const size = Number(info.fileLength || 0);
  if (size && size > MAX_STORED_MEDIA) return { skipped: true as const };
  try {
    const sock = (sessions.get(skey(accountId, slot)) || connectedSession(accountId))?.sock;
    const buffer = (await downloadMediaMessage(
      { ...msg, message: m },
      "buffer",
      {},
      sock ? { reuploadRequest: sock.updateMediaMessage, logger: undefined as any } : (undefined as any)
    )) as Buffer;
    if (!buffer || buffer.length > MAX_STORED_MEDIA) return { skipped: true as const };
    const mime = String(info.mimetype || "application/octet-stream").split(";")[0].trim();
    return {
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      mime,
      fileName: info.fileName || null,
      seconds: Number(info.seconds || 0) || null,
    };
  } catch (e) {
    console.warn("[Mídia] não consegui baixar:", (e as Error)?.message || e);
    return null;
  }
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

// ----------------------------------------------------------------------------
// GRUPOS: só os grupos ligados no painel; sem lead, sem IA, sem chatbot e sem recontato
// ----------------------------------------------------------------------------

const groupNames = new Map<string, { name: string; at: number }>();
async function groupSubject(accountId: string, jid: string) {
  const hit = groupNames.get(jid);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.name;
  try {
    const meta = await connectedSession(accountId)?.sock?.groupMetadata(jid);
    if (meta?.subject) {
      groupNames.set(jid, { name: meta.subject, at: Date.now() });
      return meta.subject as string;
    }
  } catch {}
  return hit?.name || null;
}

async function handleGroupMessage(accountId: string, msg: any, fromMe: boolean, slot = 1) {
  try {
    const jid: string = msg.key.remoteJid;
    if (!msg.key.id || (fromMe && recentSentIds.includes(msg.key.id))) return;
    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, jid)),
    });
    // Grupo que não foi ligado no painel: ignora
    if (!conversation?.isGroup || !conversation.groupEnabled) return;
    const extracted = extractText(msg.message);
    if (!extracted) return;
    const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, msg.key.id) });
    if (dup) return;
    const media = extracted.type !== "text" ? await downloadMedia(accountId, msg, slot) : null;
    const participant = String(msg.key.participant || msg.participant || "").split("@")[0].split(":")[0];
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: fromMe ? "OUT" : "IN",
      body: extracted.text,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      sender: fromMe ? "HUMAN" : "LEAD",
      authorName: fromMe ? "Celular da empresa" : msg.pushName || (participant ? `+${participant}` : null),
      mediaDataUrl: media && "dataUrl" in media ? media.dataUrl : null,
      mediaMimeType: media && "mime" in media ? media.mime : null,
      mediaFileName: media && "fileName" in media ? media.fileName : null,
    });
    const set: Record<string, unknown> = { lastMessageAt: new Date() };
    if ((conversation.waSlot || 1) !== slot) set.waSlot = slot;
    const name = await groupSubject(accountId, jid);
    if (name && name !== conversation.leadName) set.leadName = name;
    await db.update(conversations).set(set).where(eq(conversations.id, conversation.id));
  } catch (error) {
    console.error("[Error] handleGroupMessage:", error);
  }
}

/** Grupos em que o número conectado participa */
async function listGroups(accountId: string) {
  const socks: Sock[] = [];
  for (let n = 1; n <= MAX_SLOTS; n++) {
    const s = sessions.get(skey(accountId, n));
    if (s?.sock && s.state === "connected") socks.push(s.sock);
  }
  if (!socks.length) return { error: "WhatsApp desta conta não está conectado" };
  try {
    // Grupos de todos os números conectados da conta (sem repetir)
    const all: Record<string, any> = {};
    for (const sock of socks) Object.assign(all, await sock.groupFetchAllParticipating());
    const list = Object.values(all).map((g: any) => ({ jid: g.id as string, name: (g.subject as string) || "Grupo", size: Array.isArray(g.participants) ? g.participants.length : null }));
    for (const g of list) groupNames.set(g.jid, { name: g.name, at: Date.now() });
    return { groups: list.sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (e) {
    return { error: (e as Error)?.message || String(e) };
  }
}

async function handleIncomingMessage(accountId: string, msg: any, slot = 1) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (phoneJid?.endsWith("@g.us")) return handleGroupMessage(accountId, msg, false, slot);
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
    const isNewConversation = !conversation;
    const prevAt = conversation?.lastMessageAt || null;
    if (!conversation) {
      const [created] = await db
        .insert(conversations)
        .values({ accountId, phoneJid, leadName: pushName || "Lead", lastMessageAt: new Date(), waSlot: slot })
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
    // O cliente falou por este número: as respostas saem por ele
    if ((conversation.waSlot || 1) !== slot) {
      await db.update(conversations).set({ waSlot: slot }).where(eq(conversations.id, conversation.id));
    }

    const existingLead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversation.id) });
    if (!existingLead) {
      // Lead novo entra no funil escolhido para este WhatsApp (se houver)
      const waCfg = await numberConfig(accountId, slot);
      let funnelId: string | null = null;
      if (waCfg.funnelId) {
        const f = await db.query.funnels.findFirst({ where: and(eq(funnels.id, waCfg.funnelId), eq(funnels.accountId, accountId)) });
        if (f && !f.isDefault) funnelId = f.id;
      }
      await db
        .insert(leads)
        .values({ accountId, conversationId: conversation.id, cardName: pushName || "Lead", phone, stage: "FIRST_CONTACT", funnelId })
        .onConflictDoNothing();
    } else if (phone && !existingLead.phone) {
      await db.update(leads).set({ phone }).where(eq(leads.id, existingLead.id));
    }

    // A última mensagem da conversa foi um recontato? Então o cliente está respondendo a ele
    const lastMsg = await db.query.messages.findFirst({
      where: eq(messages.conversationId, conversation.id),
      orderBy: [desc(messages.sentAt)],
      columns: { direction: true, sender: true },
    });
    const repliedFollowup = lastMsg?.direction === "OUT" && lastMsg.sender === "FOLLOWUP";

    const media = extracted.type !== "text" ? await downloadMedia(accountId, msg, slot) : null;
    const sentAt = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();
    const [saved] = await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "IN",
      body: extracted.text,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt,
      sender: "LEAD",
      mediaDataUrl: media && "dataUrl" in media ? media.dataUrl : null,
      mediaMimeType: media && "mime" in media ? media.mime : null,
      mediaFileName: media && "fileName" in media ? media.fileName : null,
    }).returning({ id: messages.id });
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.conversationId, conversation.id));

    console.log(`[Mensagem ${accountId.slice(0, 8)}] ${phoneJid}: "${extracted.text.slice(0, 60)}"`);

    const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
    // Áudio do cliente: transcreve para a IA (e a equipe) entenderem
    if (extracted.type === "audio" && saved && media && "dataUrl" in media && media.dataUrl && settings?.transcribeAudio !== false) {
      await transcribeIncoming(accountId, saved.id, media.dataUrl);
    }
    // Mensagem muito antiga (recuperada depois de uma queda longa): nem o chatbot nem a IA respondem
    if (Date.now() - sentAt.getTime() < AI_RECOVERY_WINDOW_MS) {
      let handled = false;
      if (repliedFollowup) {
        try {
          handled = await onFollowupReply(accountId, conversation.id, phoneJid, extracted.text);
        } catch (err) {
          console.error(`[Recontato ${accountId.slice(0, 8)}] erro ao tratar a resposta:`, (err as Error)?.message || err);
        }
      }
      if (!handled) {
        await routeIncoming(accountId, conversation.id, { isNew: isNewConversation, prevAt, channel: "WHATSAPP" }, Boolean(settings?.enabled));
      }
    }
  } catch (error) {
    console.error("[Error] handleIncomingMessage:", error);
  }
}

async function transcribeIncoming(accountId: string, messageId: string, dataUrl: string) {
  try {
    const key = await resolveVoiceKey(accountId, "openai", loadAccount);
    if (!key.apiKey) return;
    const m = /^data:([^;,]+)[^,]*;base64,(.*)$/s.exec(dataUrl);
    if (!m) return;
    const text = await transcribeAudio(Buffer.from(m[2], "base64"), m[1], key.apiKey);
    if (!text) return;
    await db.update(messages).set({ transcript: text.slice(0, 4000) }).where(eq(messages.id, messageId));
    console.log(`[Áudio ${accountId.slice(0, 8)}] transcrito: "${text.slice(0, 60)}"`);
  } catch (err) {
    console.warn(`[Áudio ${accountId.slice(0, 8)}] não consegui transcrever:`, (err as Error)?.message || err);
  }
}

/** IDs de mensagens enviadas por este motor (para não confundir com mensagens digitadas no celular) */
const recentSentIds: string[] = [];
function rememberSent(id: string) {
  recentSentIds.push(id);
  if (recentSentIds.length > 1000) recentSentIds.shift();
}

/** Alguém respondeu pelo celular da empresa: registra e pausa a IA desse lead */
async function handleOwnPhoneMessage(accountId: string, msg: any, slot = 1) {
  try {
    const phoneJid: string = msg.key.remoteJid;
    if (phoneJid?.endsWith("@g.us")) return handleGroupMessage(accountId, msg, true, slot);
    if (isIgnoredJid(phoneJid) || !msg.key.id || recentSentIds.includes(msg.key.id)) return;
    const extracted = extractText(msg.message);
    if (!extracted) return;
    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
    if (!conversation) return;
    const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, msg.key.id) });
    if (dup) return;

    const media = extracted.type !== "text" ? await downloadMedia(accountId, msg, slot) : null;
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "OUT",
      body: extracted.text,
      messageType: extracted.type,
      whatsappMessageId: msg.key.id,
      sentAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      sender: "HUMAN",
      authorName: "Celular da empresa",
      mediaDataUrl: media && "dataUrl" in media ? media.dataUrl : null,
      mediaMimeType: media && "mime" in media ? media.mime : null,
      mediaFileName: media && "fileName" in media ? media.fileName : null,
    });
    await db.update(conversations).set({ lastMessageAt: new Date(), waSlot: slot }).where(eq(conversations.id, conversation.id));
    await db
      .update(leads)
      .set({ aiPaused: true, botId: null, botStep: null, botTries: 0, updatedAt: new Date() })
      .where(eq(leads.conversationId, conversation.id));
  } catch (error) {
    console.error("[Error] handleOwnPhoneMessage:", error);
  }
}

/** Coloca "*Nome:*" no começo da mensagem, se a conta usa assinatura */
async function signed(accountId: string, text: string, authorName?: string | null) {
  if (!authorName) return text;
  const st = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { signMessages: true } });
  if (st && st.signMessages === false) return text;
  return `*${authorName}:*\n${text}`;
}

/** Envia texto pelo WhatsApp da conta e registra no histórico */
async function sendText(accountId: string, phoneJid: string, text: string, sender: Sender, authorName?: string | null) {
  if (metaChannelOf(phoneJid)) return metaSendText(accountId, phoneJid, text, sender, authorName);
  const s = await sessionFor(accountId, phoneJid);
  if (!s?.sock || s.state !== "connected") return { error: "WhatsApp desta conta não está conectado" };
  try {
    const response = await s.sock.sendMessage(phoneJid, { text: sender === "HUMAN" ? await signed(accountId, text, authorName) : text });
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
        authorName: authorName || null,
      });
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    }
    return { success: true, messageId: response?.key?.id };
  } catch (error) {
    console.error("[Error] sendText:", error);
    return { error: String(error) };
  }
}

// ----------------------------------------------------------------------------
// ENVIO DE MÍDIA (foto, áudio gravado no painel, documento)
// ----------------------------------------------------------------------------

function ffmpegPath() {
  try {
    const req = createRequire(import.meta.url);
    const p = req("ffmpeg-static") as string | null;
    if (p) return p;
  } catch {}
  return "ffmpeg";
}

/** Converte o áudio gravado no navegador (webm) para o formato de áudio do WhatsApp (ogg/opus) */
function toOggOpus(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k",
      "-f", "ogg", "pipe:1",
    ]);
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err || `ffmpeg saiu com ${code}`))));
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

interface MediaPayload {
  kind: "image" | "audio" | "document";
  base64: string;
  mimetype: string;
  fileName?: string | null;
  caption?: string | null;
  /** Texto do áudio (quando a IA responde por voz) */
  transcript?: string | null;
}

async function sendMedia(accountId: string, phoneJid: string, media: MediaPayload, sender: Sender, authorName?: string | null) {
  if (metaChannelOf(phoneJid)) return metaSendMedia(accountId, phoneJid, media, sender, authorName);
  const s = await sessionFor(accountId, phoneJid);
  if (!s?.sock || s.state !== "connected") return { error: "WhatsApp desta conta não está conectado" };
  try {
    let buffer: Buffer = Buffer.from(media.base64, "base64");
    if (!buffer.length) return { error: "Arquivo vazio" };
    let mime = media.mimetype || "application/octet-stream";
    const caption = media.caption?.trim() ? await signed(accountId, media.caption.trim(), authorName) : undefined;
    let content: any;
    let body: string;

    if (media.kind === "audio") {
      if (!/ogg/.test(mime)) buffer = await toOggOpus(buffer);
      mime = "audio/ogg; codecs=opus";
      content = { audio: buffer, mimetype: mime, ptt: true };
      body = "[áudio]";
    } else if (media.kind === "image") {
      content = { image: buffer, mimetype: mime, caption };
      body = media.caption?.trim() || "[imagem]";
    } else {
      content = { document: buffer, mimetype: mime, fileName: media.fileName || "arquivo", caption };
      body = media.caption?.trim() || `[documento] ${media.fileName || ""}`.trim();
    }

    // Áudio não tem legenda: se a conta assina as mensagens, manda o nome antes
    if (media.kind === "audio" && authorName) {
      const withSign = await signed(accountId, "🎤 áudio", authorName);
      if (withSign !== "🎤 áudio") {
        const r0 = await s.sock.sendMessage(phoneJid, { text: withSign });
        if (r0?.key?.id) rememberSent(r0.key.id);
      }
    }

    const response = await s.sock.sendMessage(phoneJid, content);
    if (response?.key?.id) rememberSent(response.key.id);
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
    if (conv) {
      await db.insert(messages).values({
        conversationId: conv.id,
        direction: "OUT",
        body,
        messageType: media.kind,
        whatsappMessageId: response?.key?.id,
        sentAt: new Date(),
        sender,
        authorName: authorName || null,
        mediaDataUrl: buffer.length <= MAX_STORED_MEDIA ? `data:${mime.split(";")[0]};base64,${buffer.toString("base64")}` : null,
        mediaMimeType: mime.split(";")[0],
        mediaFileName: media.fileName || null,
        transcript: media.transcript || null,
      });
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    }
    return { success: true, messageId: response?.key?.id };
  } catch (error) {
    console.error("[Error] sendMedia:", error);
    return { error: (error as Error)?.message || String(error) };
  }
}

// ============================================================================
// INSTAGRAM E FACEBOOK (META)
// ============================================================================

/** Página conectada por onde a conversa chegou */
async function metaConnectionFor(accountId: string, phoneJid: string) {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
  });
  const conns = await db.select().from(metaConnections).where(eq(metaConnections.accountId, accountId));
  const channel = metaChannelOf(phoneJid);
  const conn =
    (conv?.metaPageId && conns.find((c) => c.pageId === conv.metaPageId)) ||
    conns.find((c) => (channel === "INSTAGRAM" ? Boolean(c.igUserId) : true));
  return { conv, conn, token: conn ? decryptSecret(conn.pageTokenEnc) : null };
}

async function markMetaError(connId: string, error: string | null) {
  await db.update(metaConnections).set({ lastError: error }).where(eq(metaConnections.id, connId)).catch(() => {});
}

async function metaSendText(accountId: string, phoneJid: string, text: string, sender: Sender, authorName?: string | null) {
  const { conv, conn, token } = await metaConnectionFor(accountId, phoneJid);
  if (!conn || !token) return { error: "Instagram/Facebook desta conta não está conectado" };
  try {
    const out = plainForMeta(sender === "HUMAN" ? await signed(accountId, text, authorName) : text);
    let lastId: string | null = null;
    for (const part of splitForMeta(out)) {
      lastId = await sendMetaText(token, metaUserId(phoneJid), part);
      if (lastId) rememberSent(lastId);
    }
    if (conv) {
      await db.insert(messages).values({
        conversationId: conv.id,
        direction: "OUT",
        body: text,
        messageType: "text",
        whatsappMessageId: lastId,
        sentAt: new Date(),
        sender,
        authorName: authorName || null,
      });
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    }
    if (conn.lastError) await markMetaError(conn.id, null);
    return { success: true, messageId: lastId };
  } catch (error) {
    const msg = (error as Error)?.message || String(error);
    console.error(`[Meta ${accountId.slice(0, 8)}] envio de texto:`, msg);
    await markMetaError(conn.id, msg);
    return { error: msg };
  }
}

/** Converte áudio para o formato aceito: Instagram = AAC, Messenger = MP3 */
function convertAudio(input: Buffer, target: "aac" | "mp3"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args =
      target === "aac"
        ? ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-f", "adts", "pipe:1"]
        : ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "pipe:1"];
    const p = spawn(ffmpegPath(), args);
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err || `ffmpeg saiu com ${code}`))));
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

/**
 * Mídia no Instagram/Messenger: a Meta baixa o arquivo por um link.
 * Guarda a mensagem primeiro (o link aponta para ela) e depois envia; a legenda vai logo em seguida, como texto.
 */
async function metaSendMedia(accountId: string, phoneJid: string, media: MediaPayload, sender: Sender, authorName?: string | null) {
  const { conv, conn, token } = await metaConnectionFor(accountId, phoneJid);
  if (!conn || !token || !conv) return { error: "Instagram/Facebook desta conta não está conectado" };
  const channel = metaChannelOf(phoneJid)!;
  let buffer: Buffer = Buffer.from(media.base64, "base64");
  if (!buffer.length) return { error: "Arquivo vazio" };
  let mime = (media.mimetype || "application/octet-stream").split(";")[0];
  let type: "image" | "audio" | "file" = media.kind === "image" ? "image" : media.kind === "audio" ? "audio" : "file";
  try {
    if (media.kind === "audio") {
      const target = channel === "INSTAGRAM" ? "aac" : "mp3";
      buffer = await convertAudio(buffer, target);
      mime = target === "aac" ? "audio/aac" : "audio/mpeg";
    }
    if (buffer.length > MAX_STORED_MEDIA) return { error: "Arquivo grande demais" };
    const body = media.kind === "audio" ? "[áudio]" : media.caption?.trim() || (media.kind === "image" ? "[imagem]" : `[documento] ${media.fileName || ""}`.trim());
    const [row] = await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        direction: "OUT",
        body,
        messageType: media.kind,
        sentAt: new Date(),
        sender,
        authorName: authorName || null,
        mediaDataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
        mediaMimeType: mime,
        mediaFileName: media.fileName || null,
        transcript: media.transcript || null,
      })
      .returning({ id: messages.id });
    const mid = await sendMetaAttachment(token, metaUserId(phoneJid), type, publicFileUrl("msg", row.id));
    if (mid) {
      rememberSent(mid);
      await db.update(messages).set({ whatsappMessageId: mid }).where(eq(messages.id, row.id));
    }
    // Legenda (ou assinatura do áudio) vai como texto logo depois
    const captionText =
      media.kind === "audio" ? null : media.caption?.trim() ? plainForMeta(await signed(accountId, media.caption.trim(), authorName)) : null;
    if (captionText) {
      for (const part of splitForMeta(captionText)) {
        const cm = await sendMetaText(token, metaUserId(phoneJid), part);
        if (cm) rememberSent(cm);
      }
    }
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    if (conn.lastError) await markMetaError(conn.id, null);
    return { success: true, messageId: mid };
  } catch (error) {
    const msg = (error as Error)?.message || String(error);
    console.error(`[Meta ${accountId.slice(0, 8)}] envio de mídia:`, msg);
    await markMetaError(conn.id, msg);
    return { error: msg };
  }
}

const META_KIND: Record<string, { type: string; label: string }> = {
  image: { type: "image", label: "[imagem]" },
  audio: { type: "audio", label: "[áudio]" },
  video: { type: "video", label: "[vídeo]" },
  file: { type: "document", label: "[documento]" },
};

/** Evento do webhook da Meta (repassado pelo site) */
async function handleMetaEvent(payload: any) {
  const object = payload?.object;
  if (object !== "page" && object !== "instagram") return;
  for (const entry of payload.entry || []) {
    const entryId = String(entry.id || "");
    const conn =
      object === "instagram"
        ? await db.query.metaConnections.findFirst({ where: eq(metaConnections.igUserId, entryId) })
        : await db.query.metaConnections.findFirst({ where: eq(metaConnections.pageId, entryId) });
    if (!conn) {
      console.warn(`[Meta] evento de ${object} ${entryId} sem conta conectada — ignorado`);
      continue;
    }
    await db.update(metaConnections).set({ lastEventAt: new Date() }).where(eq(metaConnections.id, conn.id)).catch(() => {});
    for (const ev of entry.messaging || []) {
      try {
        // No Messenger, mensagens do Instagram também podem chegar com object "page": o id do Instagram decide
        const isIg = object === "instagram" || (conn.igUserId && (ev.recipient?.id === conn.igUserId || ev.sender?.id === conn.igUserId));
        const channel: MetaChannel = isIg ? "INSTAGRAM" : "MESSENGER";
        if (channel === "INSTAGRAM" && !conn.instagramEnabled) continue;
        if (channel === "MESSENGER" && !conn.messengerEnabled) continue;
        await handleMetaMessage(conn, channel, ev);
      } catch (err) {
        console.error("[Meta] erro ao processar mensagem:", (err as Error)?.message || err);
      }
    }
  }
}

async function handleMetaMessage(conn: typeof metaConnections.$inferSelect, channel: MetaChannel, ev: any) {
  const msg = ev.message;
  if (!msg || msg.is_deleted || msg.is_unsupported) return;
  const accountId = conn.accountId;
  const echo = Boolean(msg.is_echo);
  const userId = String(echo ? ev.recipient?.id : ev.sender?.id || "");
  if (!userId) return;
  const phoneJid = CHANNEL_PREFIX[channel] + userId;
  const mid: string | undefined = msg.mid;
  if (mid && recentSentIds.includes(mid)) return; // enviada por este sistema
  if (mid) {
    const dup = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, mid) });
    if (dup) return;
  }

  // Texto e anexo (o primeiro)
  const att = Array.isArray(msg.attachments) ? msg.attachments[0] : null;
  const kind = att ? META_KIND[att.type] || null : null;
  const sticker = att?.payload?.sticker_id || att?.type === "like_heart";
  let text: string = typeof msg.text === "string" ? msg.text : "";
  let messageType = "text";
  let media: { dataUrl: string; mime: string } | null = null;
  if (att && sticker) {
    text = text || "[figurinha]";
  } else if (att && kind && att.payload?.url) {
    messageType = kind.type;
    text = text || kind.label;
    try {
      const f = await downloadMetaFile(att.payload.url, MAX_STORED_MEDIA);
      media = { dataUrl: `data:${f.mime};base64,${f.buffer.toString("base64")}`, mime: f.mime };
    } catch (err) {
      console.warn(`[Meta ${accountId.slice(0, 8)}] não baixei o anexo:`, (err as Error)?.message || err);
    }
  } else if (att) {
    text = text || (att.type === "share" || att.type === "story_mention" || att.type === "ig_reel" ? "[compartilhou uma publicação]" : "[mensagem]");
  }
  if (!text && !media) return;

  const token = decryptSecret(conn.pageTokenEnc);
  let conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
  });
  const isNewConversation = !conversation;
  const prevAt = conversation?.lastMessageAt || null;
  if (!conversation) {
    if (echo) return; // resposta da página para alguém que ainda não está no sistema
    const profile = token ? await metaProfile(token, userId, channel) : { name: null, handle: null };
    const [created] = await db
      .insert(conversations)
      .values({
        accountId,
        phoneJid,
        channel,
        handle: profile.handle,
        metaPageId: conn.pageId,
        leadName: profile.name || (channel === "INSTAGRAM" ? "Instagram" : "Facebook"),
        lastMessageAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    conversation =
      created ||
      (await db.query.conversations.findFirst({
        where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
      }));
    if (!conversation) return;
    await db
      .insert(leads)
      .values({ accountId, conversationId: conversation.id, cardName: conversation.leadName || "Lead", stage: "FIRST_CONTACT" })
      .onConflictDoNothing();
  } else if (!conversation.metaPageId) {
    await db.update(conversations).set({ metaPageId: conn.pageId }).where(eq(conversations.id, conversation.id));
  }

  const sentAt = ev.timestamp ? new Date(Number(ev.timestamp)) : new Date();
  const [saved] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      direction: echo ? "OUT" : "IN",
      body: text,
      messageType,
      whatsappMessageId: mid || null,
      sentAt,
      sender: echo ? "HUMAN" : "LEAD",
      authorName: echo ? (channel === "INSTAGRAM" ? "Instagram da empresa" : "Página da empresa") : null,
      mediaDataUrl: media?.dataUrl || null,
      mediaMimeType: media?.mime || null,
    })
    .returning({ id: messages.id });
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));

  if (echo) {
    // Alguém respondeu pelo app do Instagram/Facebook: a pessoa assumiu a conversa
    await db
      .update(leads)
      .set({ aiPaused: true, botId: null, botStep: null, botTries: 0, updatedAt: new Date() })
      .where(eq(leads.conversationId, conversation.id));
    return;
  }
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.conversationId, conversation.id));
  console.log(`[${channel === "INSTAGRAM" ? "Instagram" : "Messenger"} ${accountId.slice(0, 8)}] ${phoneJid}: "${text.slice(0, 60)}"`);

  const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
  if (messageType === "audio" && saved && media && settings?.transcribeAudio !== false) {
    await transcribeIncoming(accountId, saved.id, media.dataUrl);
  }
  if (Date.now() - sentAt.getTime() < AI_RECOVERY_WINDOW_MS) {
    await routeIncoming(accountId, conversation.id, { isNew: isNewConversation, prevAt, channel }, Boolean(settings?.enabled));
  }
}

// ============================================================================
// IA (SDR)
// ============================================================================

const aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
const aiRunning = new Set<string>();
const warned = new Set<string>();

function scheduleAi(accountId: string, conversationId: string, force = false) {
  const current = aiTimers.get(conversationId);
  if (current) clearTimeout(current);
  aiTimers.set(
    conversationId,
    setTimeout(() => {
      aiTimers.delete(conversationId);
      if (aiRunning.has(conversationId)) {
        scheduleAi(accountId, conversationId, force);
        return;
      }
      aiRunning.add(conversationId);
      runAi(accountId, conversationId, force)
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

/** depth: quantas trocas de agente já houve nesta rodada (evita ficar passando de um para o outro) */
async function runAi(accountId: string, conversationId: string, force = false, depth = 0) {
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
  // Regras do WhatsApp em que a conversa está (agente, vendedores, funil)
  const waCfg = conversation.channel === "WHATSAPP" ? await numberConfig(accountId, conversation.waSlot) : normalizeWaConfig(null);

  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
    limit: 30,
  });
  const history = recent.reverse();
  // Só responde se a última mensagem é do cliente (ou quando o chatbot passou a conversa para a IA)
  if (!history.length || (!force && history[history.length - 1].direction !== "IN")) return;

  // Agente de IA que atende: o do lead → palavra-chave da 1ª mensagem (campanha) → o do WhatsApp → roteador → o principal
  const allAgents = await ensureAgents(db, accountId);
  const activeAgents = allAgents.filter((a) => a.active);
  let agent = activeAgents.find((a) => a.id === lead.agentId) || null;
  let routedBy: string | null = null;
  if (!agent) {
    const firstIn = history.find((m) => m.direction === "IN");
    const kw = activeAgents.length > 1 && firstIn ? agentByKeyword(activeAgents, firstIn.transcript || firstIn.body || "") : null;
    if (kw) {
      agent = kw;
      routedBy = "palavra-chave";
    } else if (waCfg.agentId) {
      agent = activeAgents.find((a) => a.id === waCfg.agentId) || null;
    }
    if (!agent) {
      const primary = pickAgent(allAgents, null, null);
      if (primary?.routing.router && activeAgents.length > 1) {
        try {
          const r = await routeWithAi(
            activeAgents.map((a) => ({ id: a.id, name: a.name, scope: agentScope(a) })),
            history.filter((m) => m.direction === "IN").map((m) => m.transcript || m.body || ""),
            { apiKey: key.apiKey, model: settings.model || "claude-sonnet-4-5", baseUrl: process.env.ANTHROPIC_BASE_URL }
          );
          await logUsage(accountId, primary.id, settings.model || "claude-sonnet-4-5", "ROUTER", r?.usage);
          const hit = r ? activeAgents.find((a) => a.id === r.id) : null;
          if (hit) {
            agent = hit;
            routedBy = r?.intent ? `roteador: ${r.intent}` : "roteador";
          }
        } catch (err) {
          console.warn(`[IA ${accountId.slice(0, 8)}] roteador falhou, fica com o principal:`, (err as Error)?.message || err);
        }
      }
      if (!agent) agent = primary;
    }
  }
  if (!agent) return;
  if (lead.agentId !== agent.id) {
    await db
      .update(leads)
      .set({ agentId: agent.id, ...(routedBy ? { lastAction: `Encaminhado para ${agent.name} (${routedBy})`.slice(0, 120), lastActionAt: new Date() } : {}) })
      .where(eq(leads.id, lead.id));
    await logAgentEvent(accountId, lead.id, agent, "ROUTED", routedBy ? `Encaminhado para ${agent.name} (${routedBy})` : `${agent.name} começou a atender`);
  }
  const perms = agent.permissions;
  // Para quem este agente pode passar a conversa
  const targets = perms.handoffAgent
    ? activeAgents.filter((a) => a.id !== agent.id && (!agent.routing.transferTo.length || agent.routing.transferTo.includes(a.id)))
    : [];
  // Veio de outro agente há pouco? O novo agente recebe o motivo e o resumo
  const ho = (lead.agentHandoff || null) as { to?: string; fromName?: string; reason?: string | null; summary?: string | null; at?: string } | null;
  const receivedFrom =
    ho && ho.to === agent.id && ho.at && Date.now() - new Date(ho.at).getTime() < 48 * 3600e3
      ? { agent: ho.fromName || "outro agente", reason: ho.reason || null, summary: ho.summary || null }
      : null;

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

  // Catálogo: produtos ativos da conta (códigos curtos P1, P2... para a IA)
  // Ações (procedimentos) ativas da conta
  const actions = (await ensureActions(db, accountId)).filter((a) => a.active && (!agent.actionIds.length || agent.actionIds.includes(a.id)));
  const catalog =
    settings.catalogEnabled && perms.catalog ? await loadCatalog(accountId, actions, { productIds: agent.productIds, categoryIds: agent.categoryIds }) : [];
  // O que o agente não pode informar (preço, parcelamento) nem chega à IA
  for (const c of catalog) c.ai = restrictCatalogItem(c.ai, perms);
  // Sem bucket configurado a IA não oferece vídeo
  if (!storageReady()) for (const c of catalog) c.ai.hasVideo = false;
  // Qualificação "Antes de informar": até o cliente dizer nome/cidade, preço e detalhes nem chegam à IA
  const qualify = normalizeQualify(agent.qualify ?? settings.qualify);
  const leadTexts = history.filter((m) => m.direction === "IN").map((m) => m.transcript || m.body || "");
  const pending = qualifyPending(qualify, { qualifiedAt: lead.qualifiedAt, leadMessages: leadTexts.length });
  // Colunas com regra para a IA (ex.: "Ligação") de todos os funis; a do funil do lead tem preferência
  const funnelList = await ensureFunnels(db, accountId);
  const allColumns = (await Promise.all(funnelList.map((f) => ensureColumns(db, accountId, f.id)))).flat();
  const leadFunnelId = lead.funnelId || funnelList.find((f) => f.isDefault)?.id || null;
  const ruleColumns = allColumns
    .filter((c) => c.kind === "CUSTOM" && c.aiRule?.trim())
    .filter((c, _i, arr) => c.funnelId === leadFunnelId || !arr.some((o) => o.funnelId === leadFunnelId && o.name.trim().toLowerCase() === c.name.trim().toLowerCase()));

  const agentInput = (locked: boolean): Parameters<typeof runSdrAgent>[0] => ({
      systemPrompt: agentSystemPrompt(agent, settings.systemPrompt || "Você é a atendente virtual da empresa."),
      style: { style: agent.style, styleCustom: agent.styleCustom, replyLength: agent.replyLength, emojiLevel: agent.emojiLevel },
      offerVideo: agent.offerVideo && perms.videos,
      agents: targets.map((a) => ({ name: a.name, scope: agentScope(a) })),
      receivedFrom,
      sellerHours: sellerAvailability(normalizeSellerHours(settings.sellerHours)),
      qualify,
      qualifyPending: locked,
      handoffAuto: perms.handoffSeller && Boolean((settings.handoffMessage ?? "").trim()),
      lead: {
        name: lead.cardName && lead.cardName !== "Lead" ? lead.cardName : conversation.leadName,
        city: lead.city,
        interest: lead.interest,
        saleType: lead.saleType,
        stage: lead.stage,
        score: lead.score,
        summary: lead.aiSummary,
        data: (lead.qualifyData || null) as QualifyData | null,
      },
      channel: conversation.channel,
      history: history.map((m) => ({
        direction: m.direction,
        body: m.transcript ? (m.direction === "IN" ? `(áudio) ${m.transcript}` : m.transcript) : m.body,
        sender: m.sender,
      })),
      tags: allTags.map((t) => t.name),
      regions: [...new Set(rules.filter((r) => r.active && r.region).map((r) => r.region as string))],
      scheduling: {
        enabled: settings.schedulingEnabled && perms.schedule,
        businessHours: settings.businessHours,
        busy: busyRows.map((b) => `${formatSpDate(b.startsAt).slice(0, 5)} às ${formatSpTime(b.startsAt)}`),
        current: currentAppt
          ? `${currentAppt.title} em ${formatSpDate(currentAppt.startsAt)} às ${formatSpTime(currentAppt.startsAt)}`
          : null,
      },
      catalog: catalog.map((c) => (locked ? maskCatalogItem(c.ai) : c.ai)),
      actions: actions.map((a) => ({ name: a.name, kind: a.kind, instructions: a.instructions })),
      columns: ruleColumns.map((c) => ({ name: c.name, rule: c.aiRule!.trim() })),
  });
  const aiOpts = { apiKey: key.apiKey, model: settings.model || "claude-sonnet-4-5", baseUrl: process.env.ANTHROPIC_BASE_URL };
  let decision = await runSdrAgent(agentInput(pending), aiOpts);
  if (!decision) return;
  await logUsage(accountId, agent.id, aiOpts.model, "REPLY", decision.usage);

  // Dados de qualificação (endereço, uso, campos criados pela empresa...) e transferência automática:
  // com os campos obrigatórios preenchidos, o lead vai para o próximo vendedor da fila.
  const qData = mergeQualifyData(qualify, lead.qualifyData as QualifyData | null, decision.data);
  if (JSON.stringify(qData) !== JSON.stringify(lead.qualifyData || {})) {
    await db.update(leads).set({ qualifyData: qData }).where(eq(leads.id, lead.id));
  }
  const missingReq = missingForHandoff(qualify, {
    name: decision.name || (lead.cardName && lead.cardName !== "Lead" ? lead.cardName : null),
    city: decision.city || lead.city,
    data: qData,
    leadTexts,
  });
  const autoComplete = Boolean(missingReq && missingReq.length === 0);
  // "Só transferir": com os dados completos a IA não passa preço, foto nem vídeo — só a transferência
  const silentHandoff = autoComplete && onlyHandoff(qualify);
  if (silentHandoff) {
    decision.reply = (settings.handoffMessage ?? "").trim()
      ? ""
      : "Obrigado! Vou te passar para um de nossos consultores, que vai continuar seu atendimento por aqui.";
    decision.productCodes = [];
    decision.videoCode = null;
  }

  // Cliente acabou de informar os dados: responde já com preço e detalhes liberados
  let unlocked = !pending;
  if (!lead.qualifiedAt && qualify.mode !== "OFF" && isQualified(qualify, decision, leadTexts, lead.city)) {
    await db.update(leads).set({ qualifiedAt: new Date() }).where(eq(leads.id, lead.id));
    await logAgentEvent(accountId, lead.id, agent, "QUALIFIED", "Lead qualificado");
    if (pending && !silentHandoff) {
      const again = await runSdrAgent(agentInput(false), aiOpts).catch(() => null);
      await logUsage(accountId, agent.id, aiOpts.model, "REPLY", again?.usage);
      if (again) decision = again;
      unlocked = true;
    }
  }

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

  // Passar para outro Agente de IA: troca o agente e ele responde na hora, com o histórico e o resumo
  if (decision.transferAgent && perms.handoffAgent && depth < 2) {
    const wanted = decision.transferAgent.trim().toLowerCase();
    const target = targets.find((a) => a.name.trim().toLowerCase() === wanted);
    if (target) {
      await db
        .update(leads)
        .set({
          agentId: target.id,
          agentHandoff: {
            from: agent.id,
            fromName: agent.name,
            to: target.id,
            toName: target.name,
            reason: decision.transferAgentReason,
            summary: decision.summary || null,
            at: new Date().toISOString(),
          },
          aiSummary: decision.summary || lead.aiSummary,
          lastAction: `${agent.name} → ${target.name}`.slice(0, 120),
          lastActionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));
      await logAgentEvent(accountId, lead.id, agent, "TRANSFER", `${agent.name} → ${target.name}${decision.transferAgentReason ? ` (${decision.transferAgentReason})` : ""}`, {
        to: target.id,
        toName: target.name,
      });
      console.log(`[IA ${accountId.slice(0, 8)}] ${conversation.phoneJid}: ${agent.name} passou para ${target.name}${decision.transferAgentReason ? ` (${decision.transferAgentReason})` : ""}`);
      await runAi(accountId, conversationId, true, depth + 1);
      return;
    }
  }

  // Ação concluída: passa para vendedor, título/duração da agenda, coluna do funil
  const action = decision.actionName
    ? actions.find((a) => a.name.trim().toLowerCase() === decision.actionName!.trim().toLowerCase()) || null
    : null;
  const interestName = decision.interestCode ? catalog.find((c) => c.ai.code === decision.interestCode)?.ai.name : null;
  if (action) {
    if (action.handoff && !decision.handoff) {
      decision.handoff = true;
      decision.handoffReason = decision.handoffReason || `Ação: ${action.name}${interestName ? ` — ${interestName}` : ""}`;
    }
    if (action.kind === "HANDOFF") decision.handoff = true;
  }
  if (decision.appointment) {
    // Assunto da agenda pela ação (ex.: "Test-drive – Scooter X1")
    const sched = action?.kind === "SCHEDULE" ? action : null;
    const base = sched?.appointmentTitle || sched?.name || decision.appointment.subject;
    decision.appointment.subject = (interestName && !base.includes(interestName) ? `${base} – ${interestName}` : base).slice(0, 200);
  }

  if (autoComplete && !decision.handoff) {
    decision.handoff = true;
    decision.handoffReason = decision.handoffReason || "Dados da qualificação completos";
  }

  // Só o que este agente tem permissão de fazer (fotos, vídeo, agenda, funil, etiquetas, vendedor)
  restrictDecision(decision, perms);

  await applyDecision(accountId, lead.id, conversationId, decision, allTags, ruleColumns, catalog, funnelList);
  if (decision.appointment && settings.schedulingEnabled) {
    const sched = action?.kind === "SCHEDULE" ? action : null;
    await saveAiAppointment(accountId, lead.id, decision, settings, currentAppt?.id || null, sched?.appointmentMinutes || null);
    const ap = decision.appointment;
    await logAgentEvent(accountId, lead.id, agent, "APPOINTMENT", `${ap.subject} em ${ap.date.split("-").reverse().join("/")} às ${ap.time}`);
  }
  if (action) {
    await recordAction(lead.id, action, allColumns, funnelList);
    await logAgentEvent(accountId, lead.id, agent, "ACTION", action.name);
  }

  const parts = decision.reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  // Cliente mandou áudio e a conta responde por voz: a resposta vai em áudio
  const lastIn = history[history.length - 1];

  // Ritmo humano: espera um pouco mostrando "digitando..." (ou "gravando áudio...")
  const willSpeak = lastIn.messageType === "audio" && settings.voiceReplies && settings.voiceId;
  const wait = parts.length ? replyDelayMs(settings.replySpeed, Date.now() - new Date(lastIn.sentAt).getTime()) : 0;
  if (wait > 0) {
    await typingFor(accountId, conversation.phoneJid, wait, willSpeak ? "recording" : "composing");
    // O cliente mandou mais alguma coisa enquanto isso? Responde tudo junto na próxima rodada
    const newer = await db.query.messages.findFirst({
      where: eq(messages.conversationId, conversationId),
      orderBy: [desc(messages.sentAt)],
    });
    const still = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
    if (!still || still.aiPaused || still.sellerId) return;
    if (newer && newer.direction === "IN" && newer.id !== lastIn.id) {
      scheduleAi(accountId, conversationId);
      return;
    }
  }
  const spoke =
    parts.length > 0 &&
    lastIn.messageType === "audio" &&
    settings.voiceReplies &&
    settings.voiceId &&
    (await sendVoiceReply(accountId, conversation.phoneJid, parts.join("\n"), settings.voiceId));
  if (!spoke) {
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) await typingFor(accountId, conversation.phoneJid, typingMs(settings.replySpeed, parts[i]), "composing");
      await sendText(accountId, conversation.phoneJid, parts[i], "AI");
    }
  }

  // Fotos dos produtos que a IA escolheu mostrar
  // Antes do nome e da cidade (qualificação) não vai foto
  for (const ref of unlocked ? decision.productCodes : []) {
    const item = catalog.find((c) => c.ai.code === ref.code);
    if (!item) continue;
    await pause(900);
    const r = await sendProductPhoto(accountId, conversation.phoneJid, item.id, "AI", null, false, { label: ref.label, hidePrice: !unlocked || onlyHandoff(qualify) || !perms.price });
    if ("error" in r) console.warn(`[IA ${accountId.slice(0, 8)}] foto do produto ${ref.code}: ${r.error}`);
  }

  // Vídeo do produto (quando o cliente pediu ou aceitou ver)
  if (decision.videoCode) {
    const item = unlocked ? catalog.find((c) => c.ai.code === decision.videoCode && c.ai.hasVideo) : null;
    if (item) {
      await typingFor(accountId, conversation.phoneJid, 1500, "composing");
      const r = await sendProductVideo(accountId, conversation.phoneJid, item.id, "AI", null);
      if ("error" in r) console.warn(`[IA ${accountId.slice(0, 8)}] vídeo do produto ${decision.videoCode}: ${r.error}`);
    }
  }

  if (decision.handoff) {
    const sellerName = await handoffToSeller(accountId, lead.id, conversation.phoneJid, conversation.leadName, decision, settings, rules);
    await logAgentEvent(accountId, lead.id, agent, "HANDOFF_SELLER", `Passou para ${sellerName || "a equipe"}${decision.handoffReason ? ` — ${decision.handoffReason}` : ""}`, {
      minutes: Math.round((Date.now() - new Date(lead.createdAt).getTime()) / 60000),
    });
  }
  console.log(
    `[IA ${accountId.slice(0, 8)}] ${conversation.phoneJid} (${agent.name}) — nota ${decision.score}` +
      `${decision.appointment ? " — agendou" : ""}${decision.handoff ? " — transferido" : ""}`
  );
}

/** Mostra "digitando..." (ou "gravando áudio...") no WhatsApp do cliente enquanto espera */
async function typingFor(accountId: string, jid: string, ms: number, kind: "composing" | "recording") {
  const sock = metaChannelOf(jid) ? null : (await sessionFor(accountId, jid))?.sock;
  const end = Date.now() + ms;
  try {
    while (Date.now() < end) {
      if (sock) await Promise.resolve().then(() => sock.sendPresenceUpdate(kind, jid)).catch(() => {});
      await pause(Math.min(8000, end - Date.now()));
    }
    if (sock) await Promise.resolve().then(() => sock.sendPresenceUpdate("paused", jid)).catch(() => {});
  } catch {
    /* presença é só cosmética */
  }
}

/** Gera a resposta em voz (ElevenLabs) e envia como áudio do WhatsApp. false = mandar em texto. */
async function sendVoiceReply(accountId: string, phoneJid: string, text: string, voiceId: string) {
  try {
    const key = await resolveVoiceKey(accountId, "eleven", loadAccount);
    if (!key.apiKey) return false;
    const mp3 = await synthesizeSpeech(text, voiceId, key.apiKey);
    const r = await sendMedia(
      accountId,
      phoneJid,
      { kind: "audio", base64: mp3.toString("base64"), mimetype: "audio/mpeg", transcript: text },
      "AI",
      null
    );
    if ("error" in r) throw new Error(r.error);
    return true;
  } catch (err) {
    console.warn(`[Voz ${accountId.slice(0, 8)}] respondendo em texto:`, (err as Error)?.message || err);
    return false;
  }
}

/** Registra no card a ação feita pela IA (e move para a coluna da ação, se tiver) */
async function recordAction(
  leadId: string,
  action: AiAction,
  columns: { id: string; funnelId?: string | null }[],
  funnelList: { id: string; isDefault: boolean }[]
) {
  const current = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!current) return;
  const set: Record<string, unknown> = { lastAction: action.name, lastActionAt: new Date(), updatedAt: new Date() };
  if (action.columnId && current.stage !== "SALE") {
    set.columnId = action.columnId;
    // A coluna da ação define o funil do card
    const col = columns.find((c) => c.id === action.columnId);
    if (col?.funnelId) set.funnelId = funnelList.find((f) => f.id === col.funnelId)?.isDefault ? null : col.funnelId;
  }
  // Reserva, ligação e agenda deixam o lead quente
  const order = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"];
  if (["RESERVE", "CALL", "SCHEDULE", "HANDOFF"].includes(action.kind) && order.indexOf(current.stage) < 2) set.stage = "HOT_LEAD";
  await db.update(leads).set(set).where(eq(leads.id, leadId));
}

const loadCatalog = (accountId: string, actions: AiAction[] = [], only?: { productIds?: string[]; categoryIds?: string[] }) =>
  loadCatalogFor(db, accountId, actions, only);

/** Envia a primeira foto do produto com legenda "Nome — preço" (+ descrição curta) */
async function sendProductPhoto(
  accountId: string,
  phoneJid: string,
  productId: string,
  sender: Sender,
  authorName: string | null,
  withDescription = false,
  pick: { imageId?: string | null; label?: string | null; hidePrice?: boolean } = {}
) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.accountId, accountId)),
  });
  if (!product) return { error: "Produto não encontrado" };
  const allImgs = await db.query.productImages.findMany({
    where: eq(productImages.productId, productId),
    orderBy: (t, { asc }) => asc(t.sort),
  });
  // Foto escolhida no painel pode ser de cor desligada; a IA só usa as ligadas
  const img = pickProductImage(allImgs, pick);
  const caption = productCaption(product, img, withDescription, pick.hidePrice);
  if (!img) return sendText(accountId, phoneJid, caption, sender, authorName);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(img.dataUrl);
  if (!m) return { error: "Foto inválida" };
  return sendMedia(accountId, phoneJid, { kind: "image", base64: m[2], mimetype: m[1], caption }, sender, authorName);
}

/** Vídeo do produto (guardado no bucket) */
/** Envia um arquivo do Drive (foto, vídeo, áudio ou documento) */
async function sendDriveFile(accountId: string, phoneJid: string, fileId: string, sender: Sender, authorName: string | null) {
  const f = await db.query.driveFiles.findFirst({ where: and(eq(driveFiles.id, fileId), eq(driveFiles.accountId, accountId)) });
  if (!f) return { error: "Arquivo do Drive não encontrado" };
  if (!storageReady()) return { error: "Armazenamento de arquivos não configurado" };
  try {
    const channel = metaChannelOf(phoneJid);
    if (channel) {
      const { conv, conn, token } = await metaConnectionFor(accountId, phoneJid);
      if (!conn || !token || !conv) return { error: "Instagram/Facebook desta conta não está conectado" };
      const type = f.kind === "document" ? "file" : (f.kind as "image" | "video" | "audio");
      const [row] = await db
        .insert(messages)
        .values({ conversationId: conv.id, direction: "OUT", body: `[${f.kind === "document" ? "documento" : f.kind}] ${f.name}`, messageType: f.kind, sentAt: new Date(), sender, authorName: authorName || null, mediaKey: f.storageKey, mediaMimeType: f.mimeType, mediaFileName: f.name })
        .returning({ id: messages.id });
      const mid = await sendMetaAttachment(token, metaUserId(phoneJid), type, await signedUrl(f.storageKey, 6 * 3600));
      if (mid) {
        rememberSent(mid);
        await db.update(messages).set({ whatsappMessageId: mid }).where(eq(messages.id, row.id));
      }
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
      return { success: true, messageId: mid };
    }
    const s = await sessionFor(accountId, phoneJid);
    if (!s?.sock || s.state !== "connected") return { error: "WhatsApp desta conta não está conectado" };
    const buffer = await getObject(f.storageKey);
    let content: any;
    let type = f.kind;
    if (f.kind === "image") content = { image: buffer, mimetype: f.mimeType };
    else if (f.kind === "video" && f.size <= WHATSAPP_VIDEO_MAX) content = { video: buffer, mimetype: f.mimeType };
    else if (f.kind === "audio") content = { audio: buffer, mimetype: f.mimeType, ptt: false };
    else {
      type = "document";
      content = { document: buffer, mimetype: f.mimeType, fileName: f.name };
    }
    const response = await s.sock.sendMessage(phoneJid, content);
    if (response?.key?.id) rememberSent(response.key.id);
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
    if (conv) {
      await db.insert(messages).values({
        conversationId: conv.id,
        direction: "OUT",
        body: type === "document" ? `[documento] ${f.name}` : `[${type === "image" ? "imagem" : type === "video" ? "vídeo" : "áudio"}]`,
        messageType: type,
        whatsappMessageId: response?.key?.id,
        sentAt: new Date(),
        sender,
        authorName: authorName || null,
        mediaKey: f.storageKey,
        mediaMimeType: f.mimeType,
        mediaFileName: f.name,
      });
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    }
    return { success: true, messageId: response?.key?.id };
  } catch (error) {
    console.error("[Error] sendDriveFile:", error);
    return { error: (error as Error)?.message || String(error) };
  }
}

async function sendProductVideo(accountId: string, phoneJid: string, productId: string, sender: Sender, authorName: string | null) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.accountId, accountId)),
  });
  if (!product) return { error: "Produto não encontrado" };
  if (!product.videoKey) return { error: "Este produto não tem vídeo" };
  if (!storageReady()) return { error: "Armazenamento de vídeos não configurado" };
  const body = `[vídeo] ${product.name}`;
  const channel = metaChannelOf(phoneJid);
  try {
    if (channel) {
      const { conv, conn, token } = await metaConnectionFor(accountId, phoneJid);
      if (!conn || !token || !conv) return { error: "Instagram/Facebook desta conta não está conectado" };
      const [row] = await db
        .insert(messages)
        .values({ conversationId: conv.id, direction: "OUT", body, messageType: "video", sentAt: new Date(), sender, authorName: authorName || null, mediaKey: product.videoKey, mediaMimeType: "video/mp4" })
        .returning({ id: messages.id });
      const mid = await sendMetaAttachment(token, metaUserId(phoneJid), "video", await signedUrl(product.videoKey, 6 * 3600));
      if (mid) {
        rememberSent(mid);
        await db.update(messages).set({ whatsappMessageId: mid }).where(eq(messages.id, row.id));
      }
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
      return { success: true, messageId: mid };
    }
    const s = await sessionFor(accountId, phoneJid);
    if (!s?.sock || s.state !== "connected") return { error: "WhatsApp desta conta não está conectado" };
    const buffer = await getObject(product.videoKey);
    const caption = sender === "HUMAN" ? await signed(accountId, `*${product.name}*`, authorName) : `*${product.name}*`;
    const response = await s.sock.sendMessage(phoneJid, { video: buffer, mimetype: "video/mp4", caption });
    if (response?.key?.id) rememberSent(response.key.id);
    const conv = await db.query.conversations.findFirst({
      where: and(eq(conversations.accountId, accountId), eq(conversations.phoneJid, phoneJid)),
    });
    if (conv) {
      await db.insert(messages).values({
        conversationId: conv.id,
        direction: "OUT",
        body,
        messageType: "video",
        whatsappMessageId: response?.key?.id,
        sentAt: new Date(),
        sender,
        authorName: authorName || null,
        mediaKey: product.videoKey,
        mediaMimeType: "video/mp4",
      });
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    }
    return { success: true, messageId: response?.key?.id };
  } catch (error) {
    console.error("[Error] sendProductVideo:", error);
    return { error: (error as Error)?.message || String(error) };
  }
}

async function applyDecision(
  accountId: string,
  leadId: string,
  conversationId: string,
  d: AgentDecision,
  allTags: { id: string; name: string }[],
  ruleColumns: { id: string; name: string; funnelId?: string | null }[] = [],
  catalog: { id: string; funnelId?: string | null; ai: { code: string; name: string } }[] = [],
  funnelList: { id: string; isDefault: boolean }[] = []
) {
  const current = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!current) return;
  const order = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"];
  // O estágio só avança (a IA não rebaixa um lead que alguém moveu para frente)
  let stage = order.indexOf(d.stage) > order.indexOf(current.stage) || !order.includes(current.stage) ? d.stage : current.stage;
  if ((d.handoff || d.appointment) && order.indexOf(stage) < order.indexOf("HOT_LEAD")) stage = "HOT_LEAD";

  const set: Record<string, unknown> = {
    stage,
    // Coluna com regra (ex.: "Ligação"): a IA coloca o lead nela
    ...(d.columnName && normalizeStage(current.stage) !== "SALE"
      ? (() => {
          const target = ruleColumns.find((c) => c.name.trim().toLowerCase() === d.columnName!.trim().toLowerCase());
          if (!target) return {};
          const f = funnelList.find((x) => x.id === (target as { funnelId?: string | null }).funnelId);
          return { columnId: target.id, funnelId: f && !f.isDefault ? f.id : null };
        })()
      : {}),
    score: d.score,
    aiSummary: d.summary || current.aiSummary,
    updatedAt: new Date(),
  };
  if (d.city) set.city = d.city;
  if (d.phone && !current.phone) set.phone = d.phone;
  // Produto de interesse identificado pela IA
  const interest = d.interestCode ? catalog.find((c) => c.ai.code === d.interestCode) : null;
  if (interest) {
    set.productId = interest.id;
    if (!d.interest) set.interest = interest.ai.name.slice(0, 255);
    // A categoria do produto leva o card para o funil dela (ex.: "Planos")
    if (interest.funnelId && interest.funnelId !== current.funnelId && current.stage !== "SALE" && set.columnId === undefined) {
      const f = funnelList.find((x) => x.id === interest.funnelId);
      if (f) {
        set.funnelId = f.isDefault ? null : f.id;
        set.columnId = null;
      }
    }
  }
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
  existingId: string | null,
  durationMinutes: number | null = null
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
      .set({
        startsAt,
        title: d.appointment.subject,
    ...(durationMinutes ? { durationMinutes } : {}),
        ...(durationMinutes ? { durationMinutes } : {}),
        reminderSentAt: null,
        reminderError: null,
        updatedAt: new Date(),
      })
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

/** Escolhe o vendedor: regras + turno de cada um + rodízio entre os empatados (guarda a vez) */
async function assignSeller(
  accountId: string,
  rules: { region: string | null; saleType: "ANY" | "WHOLESALE" | "RETAIL"; priority: number; active: boolean; sellerId: string; seller: { active: boolean } | null }[],
  city: string | null,
  saleType: "ANY" | "WHOLESALE" | "RETAIL",
  /** Só estes vendedores (os do WhatsApp em que o lead chegou); vazio = todos */
  onlySellers: string[] = []
) {
  const only = new Set(onlySellers);
  if (only.size) rules = rules.filter((r) => only.has(r.sellerId));
  let pool = sellerPool(rules.map((r) => ({ ...r, sellerActive: r.seller?.active !== false })), city, saleType);
  const st = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
  // Número com vendedores próprios e nenhuma regra serve: a fila é com os vendedores dele
  if (!pool.length && only.size) {
    const own = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(and(eq(sellers.accountId, accountId), eq(sellers.active, true), inArray(sellers.id, [...only])));
    pool = own.map((x) => x.id);
  }
  // Rodízio ligado e nenhuma regra serve para este lead: a fila é com todos os vendedores ativos
  if (!pool.length && st?.rotationEnabled) {
    const all = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(and(eq(sellers.accountId, accountId), eq(sellers.active, true)));
    pool = all.map((x) => x.id);
  }
  if (pool.length <= 1) return pool[0] || null;
  const sel = await db
    .select({ id: sellers.id, shift: sellers.shift })
    .from(sellers)
    .where(and(eq(sellers.accountId, accountId), inArray(sellers.id, pool)));
  const r = chooseSeller(pool, {
    shifts: Object.fromEntries(sel.map((x) => [x.id, x.shift])),
    rotation: { enabled: Boolean(st?.rotationEnabled), batch: st?.rotationBatch || 1 },
    state: (st?.rotationState || {}) as RotationState,
  });
  if (st && st.rotationEnabled) await db.update(aiSettings).set({ rotationState: r.state }).where(eq(aiSettings.id, accountId));
  return r.sellerId;
}

async function handoffToSeller(
  accountId: string,
  leadId: string,
  leadJid: string,
  leadName: string | null,
  d: AgentDecision,
  settings: { handoffMessage: string | null; notifySeller: boolean; sellerHours?: unknown; afterHoursMessage?: string | null },
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
  const sellerId = await assignSeller(accountId, rules, city, saleType, (await configForJid(accountId, leadJid)).sellerIds);
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

  // Fora do horário dos consultores: avisa quando ele vai atender
  const avail = sellerAvailability(normalizeSellerHours(settings.sellerHours));
  const baseTemplate = settings.handoffMessage ?? "";
  const template = baseTemplate.trim() && !avail.open ? settings.afterHoursMessage?.trim() || DEFAULT_AFTER_HOURS : baseTemplate;
  if (template.trim()) {
    await pause(1200);
    const vars = { horario: avail.hoursText || "", retorno: avail.nextOpen || "" };
    // Sem vendedor definido: "passar para {vendedor}, nosso consultor," vira "passar para um de nossos consultores,"
    const msg = seller?.name
      ? fillTemplate(template, { vendedor: seller.name, ...vars })
      : fillTemplate(template.replace(/\{vendedor\}\s*,?\s*nosso consultor\s*,?/i, "{vendedor},"), {
          vendedor: "um de nossos consultores",
          ...vars,
        });
    await sendText(accountId, leadJid, msg, "AI");
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
        ...Object.values((current?.qualifyData || {}) as QualifyData)
          .filter((x) => x.value)
          .map((x) => `*${x.label}:* ${x.value}`),
        d.appointment ? `*Agendado:* ${d.appointment.subject} em ${d.appointment.date.split("-").reverse().join("/")} às ${d.appointment.time}` : null,
        `*Nota:* ${d.score}/100`,
        d.summary ? `\n${d.summary}` : null,
        !avail.open ? `\n⏰ Chegou fora do horário. O cliente foi avisado que você atende ${avail.nextOpen}.` : null,
        leadPhone ? `\nFalar com o cliente: https://wa.me/${leadPhone}` : `\nAbra o painel em Leads para continuar.`,
      ].filter(Boolean);
      const r = await sendText(accountId, jid, lines.join("\n"), "AI");
      if ("error" in r) console.warn("[IA] Não consegui avisar o vendedor:", r.error);
    }
  }
  return seller?.name || null;
}

// ============================================================================
// CHATBOT (MENUS SEM IA)
// ============================================================================

type IncomingCtx = { isNew: boolean; prevAt: Date | null; channel: string };
const botTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; ctx: IncomingCtx }>();
const botRunning = new Set<string>();

/** Conta com chatbot ligado? (menu liberado + pelo menos um chatbot ativo) */
async function hasActiveBots(accountId: string) {
  const one = await db
    .select({ id: chatbots.id })
    .from(chatbots)
    .where(and(eq(chatbots.accountId, accountId), eq(chatbots.active, true)))
    .limit(1);
  if (!one.length) return false;
  return accountHasModule(accountId, "chatbot", loadAccount);
}

/** Mensagem do cliente: primeiro o chatbot; se ele não atender, a IA (se ligada) */
async function routeIncoming(accountId: string, conversationId: string, ctx: IncomingCtx, aiEnabled: boolean) {
  const pending = botTimers.get(conversationId);
  if (!pending && !(await hasActiveBots(accountId))) {
    if (aiEnabled) scheduleAi(accountId, conversationId);
    return;
  }
  // Junta mensagens seguidas ("oi" + "tudo bem?") antes de responder
  if (pending) clearTimeout(pending.timer);
  const merged: IncomingCtx = pending ? { ...ctx, isNew: pending.ctx.isNew || ctx.isNew, prevAt: pending.ctx.prevAt } : ctx;
  const timer = setTimeout(async () => {
    botTimers.delete(conversationId);
    if (botRunning.has(conversationId)) return routeIncoming(accountId, conversationId, merged, aiEnabled);
    botRunning.add(conversationId);
    try {
      const handled = await runChatbot(accountId, conversationId, merged);
      if (!handled) {
        const st = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { enabled: true } });
        if (st?.enabled) scheduleAi(accountId, conversationId);
      }
    } catch (err) {
      console.error("[Chatbot] Erro:", (err as Error)?.message || err);
    } finally {
      botRunning.delete(conversationId);
    }
  }, BOT_DEBOUNCE_MS);
  botTimers.set(conversationId, { timer, ctx: merged });
}

/** Tira o lead do chatbot. next: HUMAN (equipe assume), AI (IA continua) ou END */
async function endBot(accountId: string, leadId: string, conversationId: string, next: "HUMAN" | "AI" | "END", botId: string) {
  const set: Record<string, unknown> = {
    botId: null,
    botStep: null,
    botTries: 0,
    botEndedAt: new Date(),
    botLastId: botId,
    updatedAt: new Date(),
  };
  if (next === "HUMAN") set.aiPaused = true;
  if (next === "AI") set.aiPaused = false;
  await db.update(leads).set(set).where(eq(leads.id, leadId));
  if (next === "AI") {
    const st = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { enabled: true } });
    if (st?.enabled) scheduleAi(accountId, conversationId, true);
  }
}

/** Mostra um passo; passo sem opções manda a mensagem e encerra */
async function enterStep(
  accountId: string,
  bot: Chatbot,
  stepId: string | null,
  lead: typeof leads.$inferSelect,
  conv: typeof conversations.$inferSelect
) {
  const step = bot.steps.find((x) => x.id === stepId) || null;
  if (!step) return endBot(accountId, lead.id, conv.id, "HUMAN", bot.id);
  const nome = lead.cardName && lead.cardName !== "Lead" ? lead.cardName : conv.leadName;
  const text = renderStep(step, { nome });
  if (text) {
    await pause(700);
    await sendText(accountId, conv.phoneJid, text, "BOT");
  }
  if (!step.options.length) return endBot(accountId, lead.id, conv.id, step.next, bot.id);
  await db
    .update(leads)
    .set({ botId: bot.id, botStep: step.id, botTries: 0, botAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, lead.id));
}

/** Move o card para a coluna (coluna fixa muda o estágio; personalizada guarda a coluna) */
async function moveLeadToColumn(accountId: string, leadId: string, columnId: string) {
  const col = await db.query.funnelColumns.findFirst({ where: and(eq(funnelColumns.id, columnId), eq(funnelColumns.accountId, accountId)) });
  if (!col) return;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (col.funnelId) {
    const f = await db.query.funnels.findFirst({ where: eq(funnels.id, col.funnelId) });
    set.funnelId = f && !f.isDefault ? f.id : null;
  }
  if (col.kind === "CUSTOM") set.columnId = col.id;
  else {
    set.columnId = null;
    set.stage = col.kind;
    set.closed = col.kind === "SALE";
    set.closedAt = col.kind === "SALE" ? new Date() : null;
  }
  await db.update(leads).set(set).where(eq(leads.id, leadId));
}

/** Executa o que foi configurado na opção escolhida */
async function applyBotOption(
  accountId: string,
  bot: Chatbot,
  option: BotOption,
  lead: typeof leads.$inferSelect,
  conv: typeof conversations.$inferSelect
) {
  const nome = lead.cardName && lead.cardName !== "Lead" ? lead.cardName : conv.leadName;
  if (option.reply.trim()) {
    await pause(600);
    await sendText(accountId, conv.phoneJid, fillBotText(option.reply, { nome }), "BOT");
  }
  for (const t of option.addTagIds) await db.insert(leadTags).values({ leadId: lead.id, tagId: t }).onConflictDoNothing();
  if (option.removeTagIds.length) {
    await db.delete(leadTags).where(and(eq(leadTags.leadId, lead.id), inArray(leadTags.tagId, option.removeTagIds)));
  }
  if (option.columnId) await moveLeadToColumn(accountId, lead.id, option.columnId);
  await db.update(leads).set({ lastAction: option.label.slice(0, 120), lastActionAt: new Date() }).where(eq(leads.id, lead.id));

  // Vendedor escolhido (ou pelas regras de distribuição)
  if (option.sellerId) {
    let sellerId: string | null = option.sellerId;
    if (sellerId === "AUTO") {
      const rules = await db.query.distributionRules.findMany({
        where: eq(schema.distributionRules.accountId, accountId),
        with: { seller: true },
      });
      sellerId = await assignSeller(accountId, rules, lead.city, lead.saleType, (await configForJid(accountId, conv.phoneJid)).sellerIds);
    }
    const seller = sellerId ? await db.query.sellers.findFirst({ where: and(eq(sellers.id, sellerId), eq(sellers.accountId, accountId)) }) : null;
    if (seller) {
      await db.update(leads).set({ sellerId: seller.id, aiPaused: true }).where(eq(leads.id, lead.id));
      const st = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { notifySeller: true } });
      const jid = sellerJid(seller.phone);
      if (jid && st?.notifySeller !== false) {
        const leadPhone = lead.phone || (conv.phoneJid.endsWith("@s.whatsapp.net") ? conv.phoneJid.split("@")[0] : null);
        const lines = [
          `🔔 *Novo lead para você* (chatbot)`,
          `*Cliente:* ${nome || "sem nome"}`,
          `*Escolheu:* ${option.label}`,
          leadPhone ? `\nFalar com o cliente: https://wa.me/${leadPhone}` : `\nAbra o painel em Leads para continuar.`,
        ];
        const r = await sendText(accountId, jid, lines.join("\n"), "AUTO");
        if ("error" in r) console.warn("[Chatbot] Não consegui avisar o vendedor:", r.error);
      }
    }
  }

  const fresh = (await db.query.leads.findFirst({ where: eq(leads.id, lead.id) })) || lead;
  if (option.next === "STEP") return enterStep(accountId, bot, option.stepId, fresh, conv);
  // Com vendedor definido, a conversa fica com a equipe
  const next = fresh.sellerId && option.next !== "END" ? "HUMAN" : option.next;
  return endBot(accountId, lead.id, conv.id, next, bot.id);
}

/** Decide se o chatbot atende esta mensagem. Devolve true se atendeu. */
async function runChatbot(accountId: string, conversationId: string, ctx: IncomingCtx): Promise<boolean> {
  if (!(await accountHasModule(accountId, "chatbot", loadAccount))) return false;
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  const lead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
  if (!conv || !lead) return false;
  const bots = (await listChatbots(db, accountId)).filter((b) => b.active && b.steps.length && b.channels.includes(ctx.channel));

  // Com vendedor ou venda fechada, quem atende é a equipe
  if (lead.sellerId || lead.stage === "SALE") {
    if (lead.botId) await db.update(leads).set({ botId: null, botStep: null, botTries: 0 }).where(eq(leads.id, lead.id));
    return false;
  }

  // Mensagens do cliente desde a última resposta
  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.sentAt)],
    limit: 10,
  });
  if (!recent.length || recent[0].direction !== "IN") return Boolean(lead.botId);
  const burst: string[] = [];
  for (const m of recent) {
    if (m.direction !== "IN") break;
    burst.push(m.transcript || m.body);
  }
  const last = burst[0] || "";
  const now = Date.now();

  // 1) Já está no meio de um menu
  if (lead.botId) {
    const bot = bots.find((b) => b.id === lead.botId);
    const expired = !lead.botAt || now - new Date(lead.botAt).getTime() > (bot?.restartHours || 24) * 3600e3;
    if (bot && !expired) {
      const step = bot.steps.find((x) => x.id === lead.botStep) || bot.steps[0];
      const option = matchOption(step.options, last);
      if (option) {
        console.log(`[Chatbot ${accountId.slice(0, 8)}] ${conv.phoneJid}: opção "${option.key} - ${option.label}"`);
        await applyBotOption(accountId, bot, option, lead, conv);
        return true;
      }
      const tries = lead.botTries + 1;
      if (tries > bot.maxTries) {
        if (bot.afterFail === "HUMAN") {
          await pause(600);
          await sendText(accountId, conv.phoneJid, "Tudo bem! Vou chamar alguém da equipe para te ajudar. 🙂", "BOT");
        }
        await endBot(accountId, lead.id, conv.id, bot.afterFail, bot.id);
        return true;
      }
      await pause(600);
      const list = step.options.map((o) => `*${o.key}* - ${o.label}`).join("\n");
      await sendText(accountId, conv.phoneJid, `${bot.fallbackMessage || DEFAULT_FALLBACK}\n\n${list}`, "BOT");
      await db.update(leads).set({ botTries: tries, botAt: new Date() }).where(eq(leads.id, lead.id));
      return true;
    }
    await db.update(leads).set({ botId: null, botStep: null, botTries: 0 }).where(eq(leads.id, lead.id));
  }

  if (!bots.length) return false;

  // 2) Algum chatbot deve começar?
  const leadTagIds = (await db.select({ tagId: leadTags.tagId }).from(leadTags).where(eq(leadTags.leadId, lead.id))).map((r) => r.tagId);
  const skip = (b: Chatbot) => b.skipTagIds.some((t) => leadTagIds.includes(t));
  // O mesmo chatbot não recomeça logo depois de terminar
  const endedRecently = (b: Chatbot) =>
    lead.botLastId === b.id && lead.botEndedAt && now - new Date(lead.botEndedAt).getTime() < b.restartHours * 3600e3;
  const quietFor = (b: Chatbot) => ctx.isNew || !ctx.prevAt || now - new Date(ctx.prevAt).getTime() >= b.restartHours * 3600e3;
  const text = burst.join(" ");

  const pick =
    // Palavra-chave: vale mesmo com a equipe atendendo (o cliente pediu o menu)
    bots.find((b) => b.trigger === "KEYWORD" && !skip(b) && matchKeyword(b.keywords, text)) ||
    // Etiqueta: uma vez por período, e não se a equipe já assumiu
    (!lead.aiPaused ? bots.find((b) => b.trigger === "TAG" && !skip(b) && !endedRecently(b) && b.tagIds.some((t) => leadTagIds.includes(t))) : undefined) ||
    // Início de conversa: lead novo ou que voltou depois do tempo configurado
    bots.find((b) => b.trigger === "START" && !skip(b) && quietFor(b) && (!endedRecently(b) || ctx.isNew));

  if (!pick) return false;
  console.log(`[Chatbot ${accountId.slice(0, 8)}] ${conv.phoneJid}: começou "${pick.name}"`);
  await db.update(leads).set({ aiPaused: false }).where(eq(leads.id, lead.id));
  await enterStep(accountId, pick, pick.steps[0].id, lead, conv);
  return true;
}

// ============================================================================
// RECONTATO AUTOMÁTICO (lead que parou de responder)
// ============================================================================

// ============================================================================
// DISPAROS (envio em massa, um por vez, com intervalo sorteado)
// ============================================================================

let broadcastsRunning = false;

/** Início do dia (00:00 de Brasília) */
function spDayStart(d = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${day}T00:00:00-03:00`);
}

async function processBroadcasts() {
  if (broadcastsRunning) return;
  broadcastsRunning = true;
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(broadcasts)
      .where(and(inArray(broadcasts.status, ["SCHEDULED", "RUNNING"]), lte(broadcasts.nextAt, now)))
      .orderBy(broadcasts.createdAt);
    const busy = new Set<string>(); // no máximo um envio por conta a cada rodada
    for (const b of rows) {
      if (busy.has(b.accountId)) continue;
      if (b.scheduledAt && b.scheduledAt.getTime() > now.getTime()) continue;
      const note = (lastError: string | null) => db.update(broadcasts).set({ lastError }).where(eq(broadcasts.id, b.id));
      if (b.status === "SCHEDULED") {
        await db.update(broadcasts).set({ status: "RUNNING", startedAt: b.startedAt || now }).where(eq(broadcasts.id, b.id));
      }
      if (!inWindow(b.windowStart, b.windowEnd, now)) {
        await note(`Fora do horário de envio (${b.windowStart} às ${b.windowEnd}). Continua no próximo horário.`);
        continue;
      }
      const acc = await loadAccount(b.accountId);
      if (!acc || !acc.active) continue;
      if (!connectedSession(b.accountId)) {
        await note("WhatsApp desconectado. O disparo continua quando reconectar.");
        continue;
      }
      const [{ n }] = (
        await db.execute(sql`SELECT count(*)::int AS n FROM broadcast_recipients
          WHERE account_id = ${b.accountId} AND status IN ('SENT','FAILED') AND sent_at >= ${spDayStart(now)}`)
      ).rows as { n: number }[];
      if (n >= b.dailyLimit) {
        await note(`Limite de ${b.dailyLimit} envios por dia atingido. Continua amanhã.`);
        continue;
      }
      const next = await db.query.broadcastRecipients.findFirst({
        where: and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, "PENDING")),
      });
      if (!next) {
        await db.update(broadcasts).set({ status: "DONE", finishedAt: now, lastError: null }).where(eq(broadcasts.id, b.id));
        continue;
      }
      busy.add(b.accountId);
      const text = renderMessage(b.message, { name: next.name, city: next.city });
      let r: { success?: boolean; error?: string } = await sendText(b.accountId, next.phoneJid, text, "BROADCAST", `Disparo: ${b.name}`);
      if (!r.error && b.driveFileId) r = await sendDriveFile(b.accountId, next.phoneJid, b.driveFileId, "BROADCAST", `Disparo: ${b.name}`);
      const ok = !r.error;
      await db
        .update(broadcastRecipients)
        .set({ status: ok ? "SENT" : "FAILED", error: ok ? null : String(r.error).slice(0, 300), sentAt: new Date() })
        .where(eq(broadcastRecipients.id, next.id));
      const wait = (b.minDelay + Math.random() * Math.max(0, b.maxDelay - b.minDelay)) * 1000;
      await db
        .update(broadcasts)
        .set({
          sent: ok ? sql`${broadcasts.sent} + 1` : broadcasts.sent,
          failed: ok ? broadcasts.failed : sql`${broadcasts.failed} + 1`,
          nextAt: new Date(Date.now() + wait),
          lastError: ok ? null : String(r.error).slice(0, 300),
        })
        .where(eq(broadcasts.id, b.id));
      // Muitas falhas seguidas: pausa para não insistir num número com problema
      if (!ok) {
        const last = await db
          .select({ status: broadcastRecipients.status })
          .from(broadcastRecipients)
          .where(and(eq(broadcastRecipients.broadcastId, b.id), inArray(broadcastRecipients.status, ["SENT", "FAILED"])))
          .orderBy(desc(broadcastRecipients.sentAt))
          .limit(5);
        if (last.length === 5 && last.every((x) => x.status === "FAILED")) {
          await db
            .update(broadcasts)
            .set({ status: "PAUSED", lastError: "Pausado automaticamente: 5 envios seguidos falharam. Confira o WhatsApp e continue." })
            .where(eq(broadcasts.id, b.id));
        }
      }
      console.log(`[Disparo ${b.accountId.slice(0, 8)}] ${b.name} → ${next.phoneJid}: ${ok ? "ok" : r.error}`);
    }
  } catch (err) {
    console.error("[Disparos] erro:", (err as Error)?.message || err);
  } finally {
    broadcastsRunning = false;
  }
}

let followupsRunning = false;
const FOLLOWUP_PER_RUN = 15;

async function processFollowups() {
  if (followupsRunning) return;
  followupsRunning = true;
  try {
    const rows = await db.select().from(followupSettings);
    for (const row of rows) {
      const s = withDefaults(row.config as Partial<FollowupSettings>);
      if (!s.enabled) continue;
      const accountId = row.id;
      const acc = await loadAccount(accountId);
      if (!acc || !acc.active) continue;
      if (!connectedSession(accountId)) continue; // sem WhatsApp não envia (tenta de novo depois)
      const now = new Date();
      const due = (await followupCandidates(db, accountId, s, now)).filter((c) => c.next.at.getTime() <= now.getTime());
      for (const c of due.slice(0, FOLLOWUP_PER_RUN)) {
        try {
          if (c.next.kind === "SEND") await sendFollowup(accountId, s, c);
          else await finishFollowup(accountId, s, c);
        } catch (err) {
          console.error(`[Recontato ${accountId.slice(0, 8)}] erro com ${c.phoneJid}:`, (err as Error)?.message || err);
        }
        await pause(SELFTEST ? 100 : 2500);
      }
    }
  } catch (err) {
    console.error("[Recontato] erro:", (err as Error)?.message || err);
  } finally {
    followupsRunning = false;
  }
}

async function sendFollowup(accountId: string, s: FollowupSettings, c: FollowupCandidate) {
  if (c.next.kind !== "SEND") return;
  const k = c.next.attempt;
  const total = s.attempts.length;
  const attempt = s.attempts[k];

  // Cliente parado no meio de um menu do chatbot: reenvia as opções junto
  let menu: string | null = null;
  if (c.botId) {
    const bot = (await listChatbots(db, accountId)).find((b) => b.id === c.botId);
    const step = bot?.steps.find((x) => x.id === c.botStep);
    if (step?.options.length) menu = step.options.map((o) => `*${o.key}* - ${o.label}`).join("\n");
  }

  let text: string | null = null;
  if (s.mode === "AI") {
    const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
    const key = settings?.enabled ? await resolveAiKey(accountId, loadAccount) : null;
    if (settings?.enabled && key?.apiKey) {
      const recent = await db.query.messages.findMany({
        where: eq(messages.conversationId, c.conversationId),
        orderBy: [desc(messages.sentAt)],
        limit: 20,
      });
      try {
        text = await generateFollowup(
          {
            systemPrompt: settings.systemPrompt,
            instructions: s.aiInstructions,
            leadName: c.name,
            attempt: k + 1,
            total,
            pendingMenu: menu,
            history: recent.reverse().map((m) => ({
              direction: m.direction,
              body: m.transcript ? `(áudio) ${m.transcript}` : m.body,
              sender: m.sender,
            })),
          },
          {
            apiKey: key.apiKey,
            model: settings.model || "claude-sonnet-4-5",
            baseUrl: process.env.ANTHROPIC_BASE_URL,
            onUsage: (u) => void logUsage(accountId, null, settings.model || "claude-sonnet-4-5", "FOLLOWUP", u),
          }
        );
      } catch (err) {
        console.warn(`[Recontato ${accountId.slice(0, 8)}] IA falhou, usando o texto fixo:`, (err as Error)?.message || err);
      }
    }
  }
  if (!text) text = fillName(attempt.text, c.name);
  if (menu) text = `${text}\n\n${menu}`;

  const r = await sendText(accountId, c.phoneJid, text, "FOLLOWUP", `Recontato ${k + 1}/${total}`);
  if ("error" in r) {
    console.warn(`[Recontato ${accountId.slice(0, 8)}] não enviei para ${c.phoneJid}:`, r.error);
    return;
  }
  const set: Record<string, unknown> = { fuCount: k + 1, fuLastAt: new Date() };
  if (c.botId) set.botAt = new Date(); // mantém o menu do chatbot valendo
  await db.update(leads).set(set).where(eq(leads.id, c.leadId));
  console.log(`[Recontato ${accountId.slice(0, 8)}] ${c.phoneJid}: tentativa ${k + 1}/${total} enviada`);
}

async function finishFollowup(accountId: string, s: FollowupSettings, c: FollowupCandidate) {
  const set: Record<string, unknown> = {
    fuCount: s.attempts.length + 1,
    botId: null,
    botStep: null,
    botTries: 0,
    lastAction: "Sem resposta (recontato)",
    lastActionAt: new Date(),
    updatedAt: new Date(),
  };
  if (s.moveToDisqualified) {
    set.columnId = await ensureDisqualifiedColumn(db, accountId, c.funnelId, s.disqualifiedColumnName || "Desqualificado");
  }
  await db.update(leads).set(set).where(eq(leads.id, c.leadId));
  const tagName = s.addTagName.trim();
  if (tagName) {
    let tag = await db.query.tags.findFirst({ where: and(eq(tags.accountId, accountId), sql`lower(${tags.name}) = lower(${tagName})`) });
    if (!tag) [tag] = await db.insert(tags).values({ accountId, name: tagName.slice(0, 60), color: "gray" }).returning();
    await db.insert(leadTags).values({ leadId: c.leadId, tagId: tag.id }).onConflictDoNothing();
  }
  console.log(`[Recontato ${accountId.slice(0, 8)}] ${c.phoneJid}: sem resposta — desqualificado`);
}

/**
 * O cliente respondeu ao recontato: aplica o que foi configurado (tirar de Desqualificado, etiqueta,
 * coluna, avisar o vendedor e, se escolhido, passar para o vendedor).
 * Devolve true quando passou para o vendedor (aí a IA e o chatbot não respondem).
 */
async function onFollowupReply(accountId: string, conversationId: string, phoneJid: string, text: string) {
  const row = await db.query.followupSettings.findFirst({ where: eq(followupSettings.id, accountId) });
  if (!row) return false;
  const s = withDefaults(row.config as Partial<FollowupSettings>);
  const lead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
  if (!lead || lead.closed) return false;
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  const leadName = (lead.cardName && lead.cardName !== "Lead" ? lead.cardName : conv?.leadName) || null;

  const set: Record<string, unknown> = {
    fuCount: 0,
    fuLastAt: null,
    lastAction: "Respondeu o recontato",
    lastActionAt: new Date(),
    updatedAt: new Date(),
  };

  // Estava em "Desqualificado": volta para a etapa em que estava e tira a etiqueta de sem resposta
  if (s.replyRescue) {
    if (lead.columnId) {
      const col = await db.query.funnelColumns.findFirst({ where: eq(funnelColumns.id, lead.columnId) });
      const dq = (s.disqualifiedColumnName || "").trim().toLowerCase();
      if (col && dq && col.name.trim().toLowerCase() === dq) set.columnId = null;
    }
    const noAnswer = s.addTagName.trim();
    if (noAnswer) {
      const tag = await db.query.tags.findFirst({ where: and(eq(tags.accountId, accountId), sql`lower(${tags.name}) = lower(${noAnswer})`) });
      if (tag) await db.delete(leadTags).where(and(eq(leadTags.leadId, lead.id), eq(leadTags.tagId, tag.id)));
    }
  }
  await db.update(leads).set(set).where(eq(leads.id, lead.id));

  if (s.replyColumnId) await moveLeadToColumn(accountId, lead.id, s.replyColumnId);

  const tagName = s.replyTagName.trim();
  if (tagName) {
    let tag = await db.query.tags.findFirst({ where: and(eq(tags.accountId, accountId), sql`lower(${tags.name}) = lower(${tagName})`) });
    if (!tag) [tag] = await db.insert(tags).values({ accountId, name: tagName.slice(0, 60), color: "green" }).returning();
    await db.insert(leadTags).values({ leadId: lead.id, tagId: tag.id }).onConflictDoNothing();
  }

  // Vendedor do lead (ou um novo, pela fila, quando é para transferir)
  let seller = lead.sellerId ? await db.query.sellers.findFirst({ where: eq(sellers.id, lead.sellerId) }) : null;
  if (seller && !seller.active) seller = null;
  let handed = false;
  if (s.replyAction === "HANDOFF") {
    if (!seller || !s.replySameSeller) {
      const rules = await db.query.distributionRules.findMany({
        where: eq(schema.distributionRules.accountId, accountId),
        with: { seller: true },
      });
      const id = await assignSeller(accountId, rules, lead.city, lead.saleType, (await configForJid(accountId, phoneJid)).sellerIds);
      seller = id ? (await db.query.sellers.findFirst({ where: eq(sellers.id, id) })) || null : seller;
    }
    if (seller) {
      await db
        .update(leads)
        .set({ sellerId: seller.id, aiPaused: true, botId: null, botStep: null, botTries: 0, lastAction: "Recontato: passou para o vendedor", updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
      handed = true;
      const template = s.replyHandoffMessage.trim();
      if (template) {
        await pause(1500);
        const msg = fillTemplate(fillName(template, leadName), { vendedor: seller.name });
        await sendText(accountId, phoneJid, msg, "AI");
      }
    } else {
      console.warn(`[Recontato ${accountId.slice(0, 8)}] ${phoneJid}: respondeu, mas não há vendedor ativo; a conversa segue normal`);
    }
  }

  if (seller && s.replyNotifySeller) {
    const jid = sellerJid(seller.phone);
    if (jid) {
      const leadPhone = lead.phone || (phoneJid.endsWith("@s.whatsapp.net") ? phoneJid.split("@")[0] : null);
      const lines = [
        handed ? `🔔 *Lead para você* (respondeu o recontato)` : `🔁 *Cliente voltou a responder* (recontato)`,
        `*Cliente:* ${leadName || "sem nome"}`,
        lead.city ? `*Cidade:* ${lead.city}` : null,
        ...Object.values((lead.qualifyData || {}) as QualifyData)
          .filter((x) => x.value)
          .map((x) => `*${x.label}:* ${x.value}`),
        text ? `*Mensagem:* ${text.slice(0, 300)}` : null,
        leadPhone ? `\nFalar com o cliente: https://wa.me/${leadPhone}` : `\nAbra o painel em Leads para continuar.`,
      ].filter(Boolean);
      const r = await sendText(accountId, jid, lines.join("\n"), "AI");
      if ("error" in r) console.warn("[Recontato] Não consegui avisar o vendedor:", r.error);
    }
  }
  console.log(`[Recontato ${accountId.slice(0, 8)}] ${phoneJid}: respondeu${handed ? " — passou para o vendedor" : ""}`);
  return handed;
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
      const session = await sessionFor(appt.accountId, lead.conversation.phoneJid);
      if (!session) {
        if (appt.reminderError !== "WhatsApp desconectado") {
          await db.update(appointments).set({ reminderError: "WhatsApp desconectado" }).where(eq(appointments.id, appt.id));
        }
        continue; // tenta de novo na próxima rodada
      }
      const seller = appt.sellerId ? await db.query.sellers.findFirst({ where: eq(sellers.id, appt.sellerId) }) : null;
      // Sem nome conhecido: "Olá, {nome}!" vira "Olá!"
      const name =
        lead.cardName && lead.cardName !== "Lead"
          ? lead.cardName
          : lead.conversation.leadName && lead.conversation.leadName !== "Lead"
          ? lead.conversation.leadName
          : "";
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
      )
        .replace(/\s+([!,.?])/g, "$1")
        .replace(/,([!.?])/g, "$1")
        .replace(/ {2,}/g, " ");
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

async function statusOf(accountId: string, slot = 1) {
  const s = sessions.get(skey(accountId, slot));
  const state = s?.state || "idle";
  return {
    state,
    connected: state === "connected",
    phone: s?.phone || null,
    qrDataUrl: s?.qr ? await QRCode.toDataURL(s.qr, { width: 320 }) : null,
  };
}

/** Número do WhatsApp pedido (1 a 3) */
function slotOf(v: unknown) {
  const n = Math.round(Number(v || 1));
  return Number.isFinite(n) && n >= 1 && n <= MAX_SLOTS ? n : 1;
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
          return json(res, 200, await statusOf(acc.id, slotOf(url.searchParams.get("slot"))));
        }

        if (req.method !== "POST") return json(res, 404, { error: "not found" });
        const body = await readBody(req);

        if (SELFTEST && url.pathname === "/__test/incoming") {
          const acc = await validAccount(body.accountId);
          if (!acc) return json(res, 400, { error: "Conta inválida" });
          if (body.msg?.key?.fromMe) await handleOwnPhoneMessage(acc.id, body.msg, slotOf(body.slot));
          else await handleIncomingMessage(acc.id, body.msg, slotOf(body.slot));
          return json(res, 200, {});
        }
        if (SELFTEST && url.pathname === "/__test/reminders") {
          await processReminders();
          return json(res, 200, {});
        }

        if (url.pathname === "/meta-event") {
          // Responde logo; o processamento continua em segundo plano
          handleMetaEvent(body).catch((err) => console.error("[Meta] erro:", err));
          return json(res, 200, { ok: true });
        }

        const acc = await validAccount(body.accountId);
        if (!acc) return json(res, 400, { error: "Conta inválida" });

        if (url.pathname === "/resolve-number") {
          // Confere se o número tem WhatsApp e devolve o endereço certo (resolve o 9º dígito)
          const digits = String(body.phone || "").replace(/\D/g, "");
          if (digits.length < 10) return json(res, 400, { error: "Número inválido" });
          const sock = connectedSession(acc.id)?.sock;
          if (!sock) return json(res, 502, { error: "WhatsApp desta conta não está conectado" });
          try {
            const found = await sock.onWhatsApp(digits);
            const hit = Array.isArray(found) ? found.find((f: any) => f?.exists) : null;
            return json(res, 200, { exists: Boolean(hit), jid: hit?.jid || null });
          } catch (e) {
            return json(res, 200, { exists: null, jid: null, error: (e as Error)?.message });
          }
        }
        if (url.pathname === "/groups") {
          const r = await listGroups(acc.id);
          return json(res, "error" in r ? 502 : 200, r);
        }
        if (url.pathname === "/connect") {
          const slot = slotOf(body.slot);
          if (slot > slotsOf(acc)) return json(res, 403, { error: `Esta conta pode ter até ${slotsOf(acc)} WhatsApp(s)` });
          const s = getSession(acc.id, slot);
          if (s.state === "idle") {
            s.qrCount = 0;
            await startSession(acc.id, slot);
            // espera um pouco pelo primeiro QR
            for (let i = 0; i < 20 && getSession(acc.id, slot).state === "starting"; i++) await pause(300);
          }
          return json(res, 200, await statusOf(acc.id, slot));
        }
        if (url.pathname === "/logout") {
          await stopSession(acc.id, true, slotOf(body.slot));
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/send") {
          if (!body.phoneJid || !body.text) return json(res, 400, { error: "phoneJid e text são obrigatórios" });
          const sender: Sender = body.sender === "AI" ? "AI" : body.sender === "AUTO" ? "AUTO" : "HUMAN";
          const r = await sendText(acc.id, body.phoneJid, String(body.text), sender, body.authorName || null);
          return json(res, "error" in r ? 502 : 200, r);
        }
        if (url.pathname === "/send-media") {
          const media = body.media as MediaPayload | undefined;
          if (!body.phoneJid || !media?.base64 || !["image", "audio", "document"].includes(media.kind)) {
            return json(res, 400, { error: "Mídia inválida" });
          }
          const r = await sendMedia(acc.id, body.phoneJid, media, body.sender === "AUTO" ? "AUTO" : "HUMAN", body.authorName || null);
          return json(res, "error" in r ? 502 : 200, r);
        }
        if (url.pathname === "/send-drive") {
          if (!body.phoneJid || !body.fileId) return json(res, 400, { error: "Arquivo inválido" });
          const r = await sendDriveFile(acc.id, body.phoneJid, String(body.fileId), "HUMAN", body.authorName || null);
          return json(res, "error" in r ? 502 : 200, r);
        }
        if (url.pathname === "/send-product") {
          if (!body.phoneJid || !body.productId) return json(res, 400, { error: "Produto inválido" });
          const r = body.video
            ? await sendProductVideo(acc.id, body.phoneJid, String(body.productId), "HUMAN", body.authorName || null)
            : await sendProductPhoto(acc.id, body.phoneJid, String(body.productId), "HUMAN", body.authorName || null, true, {
                imageId: body.imageId ? String(body.imageId) : null,
              });
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
  setInterval(() => processFollowups(), SELFTEST ? 3_000 : 60_000);
  setInterval(() => processBroadcasts(), SELFTEST ? 2_000 : 10_000);

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

