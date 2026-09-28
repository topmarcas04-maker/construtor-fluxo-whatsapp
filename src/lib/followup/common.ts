/**
 * Recontato automático (follow-up) de leads que pararam de responder.
 * Sem dependências "@/": usado no navegador, no site e no motor.
 *
 * Regra: depois da última mensagem da empresa (IA, chatbot ou equipe) sem resposta do cliente,
 * espera "afterHours" e envia a tentativa no horário escolhido. Depois da última tentativa,
 * espera "finalHours" e move o card para "Desqualificado" (e coloca a etiqueta).
 * Se o cliente responder, tudo recomeça do zero e valem as opções "reply*" (continuar ou passar para o vendedor,
 * avisar o vendedor, etiqueta, coluna e tirar de Desqualificado).
 */
import { fromSpDateTime, toSpParts } from "../time";

export interface FollowupAttempt {
  /** Horas de espera (desde a última mensagem ou a tentativa anterior) */
  afterHours: number;
  /** Horário do envio "HH:MM" (Brasília) */
  time: string;
  /** Texto fixo (usado no modo texto, ou se a IA falhar). {nome} = nome do cliente */
  text: string;
}

export interface FollowupSettings {
  enabled: boolean;
  /** AI = a IA escreve a mensagem olhando a conversa; TEXT = texto fixo de cada tentativa */
  mode: "AI" | "TEXT";
  aiInstructions: string;
  attempts: FollowupAttempt[];
  /** Dias da semana permitidos (0 = domingo ... 6 = sábado) */
  days: number[];
  /** Incluir leads que estão com a equipe (IA pausada / chatbot passou para a equipe) */
  includeTeam: boolean;
  /** Incluir leads com vendedor definido */
  includeWithSeller: boolean;
  /** Só leads com nota até X (vazio = todos) */
  maxScore: number | null;
  /** Só leads nestas colunas (vazio = todas) */
  columnIds: string[];
  skipTagIds: string[];
  /** Horas de espera depois da última tentativa antes de desqualificar */
  finalHours: number;
  moveToDisqualified: boolean;
  disqualifiedColumnName: string;
  addTagName: string;

  // ---- Quando o cliente RESPONDE ao recontato ----
  /** CONTINUE = a conversa segue normal (IA, chatbot ou equipe); HANDOFF = passa para um vendedor */
  replyAction: "CONTINUE" | "HANDOFF";
  /** Na transferência: se o lead já tinha vendedor, volta para ele (senão, fila/rodízio) */
  replySameSeller: boolean;
  /** Mensagem ao cliente na transferência. {nome} e {vendedor}. Vazio = não envia */
  replyHandoffMessage: string;
  /** Avisar o vendedor do lead no WhatsApp que o cliente voltou a responder */
  replyNotifySeller: boolean;
  /** Etiqueta colocada em quem respondeu (vazio = nenhuma) */
  replyTagName: string;
  /** Mover o card para esta coluna (null = não move) */
  replyColumnId: string | null;
  /** Se estava em "Desqualificado", volta para o funil e tira a etiqueta de sem resposta */
  replyRescue: boolean;
}

export const DISQUALIFIED_DEFAULT = "Desqualificado";
export const NO_ANSWER_TAG = "Sem resposta";
export const MAX_ATTEMPTS = 5;
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const DEFAULT_FOLLOWUP: FollowupSettings = {
  enabled: false,
  mode: "AI",
  aiInstructions: "",
  attempts: [
    { afterHours: 48, time: "09:30", text: "Oi, {nome}! Tudo bem? Ficou alguma dúvida? Estou por aqui para te ajudar 😊" },
    { afterHours: 48, time: "14:30", text: "{nome}, passando para saber se ainda tem interesse. Posso te ajudar com alguma informação?" },
    { afterHours: 48, time: "18:30", text: "Oi, {nome}! Vou encerrar seu atendimento por aqui, mas se precisar é só me chamar. 😉" },
  ],
  days: [1, 2, 3, 4, 5, 6],
  includeTeam: false,
  includeWithSeller: false,
  maxScore: null,
  columnIds: [],
  skipTagIds: [],
  finalHours: 24,
  moveToDisqualified: true,
  disqualifiedColumnName: DISQUALIFIED_DEFAULT,
  addTagName: NO_ANSWER_TAG,
  replyAction: "CONTINUE",
  replySameSeller: true,
  replyHandoffMessage: "Que bom falar com você de novo, {nome}! Vou te passar para {vendedor}, que vai continuar seu atendimento. 😊",
  replyNotifySeller: true,
  replyTagName: "Reativado",
  replyColumnId: null,
  replyRescue: true,
};

export const REACTIVATED_TAG = "Reativado";

/** Completa/normaliza o que veio do banco */
export function withDefaults(raw: Partial<FollowupSettings> | null | undefined): FollowupSettings {
  const r = raw || {};
  return {
    ...DEFAULT_FOLLOWUP,
    ...r,
    attempts: Array.isArray(r.attempts) && r.attempts.length ? r.attempts : DEFAULT_FOLLOWUP.attempts,
    days: Array.isArray(r.days) && r.days.length ? r.days : DEFAULT_FOLLOWUP.days,
    columnIds: Array.isArray(r.columnIds) ? r.columnIds : [],
    skipTagIds: Array.isArray(r.skipTagIds) ? r.skipTagIds : [],
  };
}

/** Variação de 0 a 20 minutos por lead (para não sair tudo no mesmo minuto) */
export function jitterMinutes(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 21;
}

/**
 * Primeiro horário "time" num dia permitido que seja >= target.
 * Se esse horário já passou há mais de 3h (sistema fora do ar), vai para o próximo dia permitido.
 */
export function slotAt(target: Date, time: string, days: number[], now: Date, jitter = 0): Date {
  const allowed = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  let { date } = toSpParts(target);
  for (let i = 0; i < 15; i++) {
    const d = fromSpDateTime(date, time);
    if (d) {
      const slot = new Date(d.getTime() + jitter * 60e3);
      const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
      const late = now.getTime() - slot.getTime() > 3 * 3600e3;
      if (slot.getTime() >= target.getTime() && allowed.includes(weekday) && !late) return slot;
    }
    // próximo dia
    const next = new Date(`${date}T12:00:00-03:00`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = toSpParts(next).date;
  }
  return new Date(target.getTime() + 864e5);
}

export interface LeadFollowupState {
  id: string;
  fuCount: number;
  fuLastAt: Date | string | null;
  lastAt: Date | string;
  lastSender: string | null;
}

/**
 * Próximo passo do recontato para o lead: enviar a tentativa N em "at", desqualificar em "at", ou nada.
 * O chamador já filtrou quem pode receber (última mensagem é da empresa, canal WhatsApp etc.).
 */
export function nextFollowup(
  lead: LeadFollowupState,
  s: FollowupSettings,
  now: Date
): { kind: "SEND"; attempt: number; at: Date } | { kind: "FINAL"; at: Date } | null {
  const lastAt = new Date(lead.lastAt);
  // Alguém da empresa falou depois do último recontato: recomeça a contagem
  const fresh = lead.lastSender !== "FOLLOWUP";
  const count = fresh ? 0 : lead.fuCount;
  const base = fresh || !lead.fuLastAt ? lastAt : new Date(lead.fuLastAt);
  const n = s.attempts.length;
  if (count < n) {
    const a = s.attempts[count];
    const target = new Date(base.getTime() + Math.max(1, a.afterHours) * 3600e3);
    return { kind: "SEND", attempt: count, at: slotAt(target, a.time, s.days, now, jitterMinutes(lead.id + count)) };
  }
  if (count === n && (s.moveToDisqualified || s.addTagName.trim())) {
    return { kind: "FINAL", at: new Date(base.getTime() + Math.max(0, s.finalHours) * 3600e3) };
  }
  return null;
}

/** Troca {nome} pelo primeiro nome (sem nome, tira a vírgula junto) */
export function fillName(text: string, nome?: string | null) {
  const first = (nome || "").trim().split(/\s+/)[0] || "";
  return (text || "")
    .replace(/,?\s*\{nome\}/gi, (m) => (first ? m.replace(/\{nome\}/i, first) : ""))
    .replace(/^\s*[,!]\s*/, "")
    .trim();
}

// ============================================================================
// VÁRIOS RECONTATOS + COBERTURA DO VENDEDOR
// ============================================================================

/** Quais leads o recontato pega, pelo vendedor */
export type SellerScope = "ALL" | "WITH" | "WITHOUT";

/** Um recontato da conta (a conta pode ter vários; o lead entra no primeiro que servir) */
export interface FollowupItem extends FollowupSettings {
  id: string;
  name: string;
  /** ALL = todos; WITH = só leads com vendedor; WITHOUT = só leads sem vendedor */
  sellerScope: SellerScope;
}

/** Agente que assume quando o vendedor não responde o cliente */
export interface CoverSettings {
  enabled: boolean;
  /** Horas que o cliente fica esperando o vendedor antes do agente assumir (1 a 720) */
  hours: number;
  /** Agente que assume (vazio = o agente do lead / o principal) */
  agentId: string | null;
  /** Avisar o vendedor no WhatsApp que o agente assumiu */
  notifySeller: boolean;
  /** Só assumir dentro do horário dos consultores */
  onlyOpenHours: boolean;
}

export interface FollowupConfig {
  items: FollowupItem[];
  cover: CoverSettings;
}

export const MAX_FOLLOWUPS = 10;

export const DEFAULT_COVER: CoverSettings = {
  enabled: false,
  hours: 2,
  agentId: null,
  notifySeller: true,
  onlyOpenHours: false,
};

export function newFollowupId() {
  return `fu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Recontato novo (para o botão "Novo recontato") */
export function newFollowupItem(name = "Novo recontato"): FollowupItem {
  return { ...DEFAULT_FOLLOWUP, id: newFollowupId(), name, sellerScope: "WITHOUT" };
}

function itemWithDefaults(raw: Partial<FollowupItem> | null | undefined, i: number): FollowupItem {
  const base = withDefaults(raw);
  const r = raw || {};
  const scope: SellerScope =
    r.sellerScope === "ALL" || r.sellerScope === "WITH" || r.sellerScope === "WITHOUT"
      ? r.sellerScope
      : base.includeWithSeller
      ? "ALL"
      : "WITHOUT";
  return {
    ...base,
    id: typeof r.id === "string" && r.id ? r.id : i === 0 ? "principal" : `fu_${i}`,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : i === 0 ? "Recontato geral" : `Recontato ${i + 1}`,
    sellerScope: scope,
    includeWithSeller: scope !== "WITHOUT",
  };
}

export function coverWithDefaults(raw: Partial<CoverSettings> | null | undefined): CoverSettings {
  const r = raw || {};
  const hours = Number(r.hours);
  return {
    ...DEFAULT_COVER,
    ...r,
    hours: Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 720) : DEFAULT_COVER.hours,
    agentId: typeof r.agentId === "string" && r.agentId ? r.agentId : null,
  };
}

/**
 * Lê a configuração guardada. Formato antigo (um recontato só, direto no objeto) vira
 * o "Recontato geral"; o novo é { items: [...], cover: {...} }.
 */
export function parseFollowupConfig(raw: unknown): FollowupConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (Array.isArray(r.items)) {
    return {
      items: (r.items as Partial<FollowupItem>[]).slice(0, MAX_FOLLOWUPS).map(itemWithDefaults),
      cover: coverWithDefaults(r.cover as Partial<CoverSettings>),
    };
  }
  const legacy = Object.keys(r).length ? [itemWithDefaults(r as Partial<FollowupItem>, 0)] : [];
  return { items: legacy, cover: coverWithDefaults(r.cover as Partial<CoverSettings>) };
}

/** O lead passa no filtro de vendedor deste recontato? */
export function sellerScopeOk(scope: SellerScope, hasSeller: boolean) {
  if (scope === "WITH") return hasSeller;
  if (scope === "WITHOUT") return !hasSeller;
  return true;
}

export const SELLER_SCOPE_LABEL: Record<SellerScope, string> = {
  ALL: "Todos os leads",
  WITH: "Só leads com vendedor",
  WITHOUT: "Só leads sem vendedor",
};
