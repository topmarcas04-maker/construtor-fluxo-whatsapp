/**
 * Disparos — regras sem dependências (tela, site e motor). Sem imports "@/".
 */

export interface BroadcastFilters {
  /** Tem pelo menos uma destas etiquetas (vazio = qualquer) */
  tagIds: string[];
  /** Não tem nenhuma destas etiquetas */
  excludeTagIds: string[];
  /** Está numa destas colunas do funil (vazio = qualquer) */
  columnIds: string[];
  /** Cidades (contém o texto, sem acento). Vazio = todas */
  cities: string[];
  /** Produto de interesse (vazio = qualquer) */
  productIds: string[];
  /** Vendedor responsável ("none" = sem vendedor). Vazio = qualquer */
  sellerIds: string[];
  /** Incluir vendas fechadas */
  includeClosed: boolean;
  /** Só quem já mandou mensagem alguma vez (mais seguro contra bloqueio) */
  onlyReplied: boolean;
  /** Só quem teve conversa nos últimos N dias (0 = qualquer) */
  activeDays: number;
}

export const DEFAULT_FILTERS: BroadcastFilters = {
  tagIds: [],
  excludeTagIds: [],
  columnIds: [],
  cities: [],
  productIds: [],
  sellerIds: [],
  includeClosed: false,
  onlyReplied: true,
  activeDays: 0,
};

const ids = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 100) : []);

export function normalizeFilters(v: unknown): BroadcastFilters {
  const o = (v && typeof v === "object" ? v : {}) as Partial<BroadcastFilters>;
  return {
    tagIds: ids(o.tagIds),
    excludeTagIds: ids(o.excludeTagIds),
    columnIds: ids(o.columnIds),
    cities: ids(o.cities).map((c) => c.trim().slice(0, 80)).filter(Boolean),
    productIds: ids(o.productIds),
    sellerIds: ids(o.sellerIds),
    includeClosed: o.includeClosed === true,
    onlyReplied: o.onlyReplied !== false,
    activeDays: Math.max(0, Math.min(3650, Math.round(Number(o.activeDays)) || 0)),
  };
}

/** Variações da mensagem: separadas por uma linha só com --- */
export function messageVariations(message: string) {
  return message
    .split(/\n\s*-{3,}\s*\n/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Escolhe uma variação e troca {nome} e {cidade} */
export function renderMessage(message: string, lead: { name?: string | null; city?: string | null }, pick = Math.random()) {
  const vars = messageVariations(message);
  const chosen = vars[Math.min(vars.length - 1, Math.floor(pick * vars.length))] || "";
  const first = (lead.name || "").trim().split(/\s+/)[0] || "";
  return chosen
    .replace(/,?\s*\{nome\}/gi, (m) => (first ? m.replace(/\{nome\}/i, first) : ""))
    .replace(/\{cidade\}/gi, (lead.city || "").trim())
    .replace(/^\s*[,!]\s*/, "")
    .trim();
}

/** Minutos do dia no horário de Brasília */
export function spMinutes(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = Number(p.find((x) => x.type === "hour")?.value || 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value || 0);
  return h * 60 + m;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function inWindow(start: string, end: string, d = new Date()) {
  const now = spMinutes(d);
  const a = toMin(start);
  const b = toMin(end);
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  RUNNING: "Enviando",
  PAUSED: "Pausado",
  DONE: "Concluído",
  CANCELED: "Cancelado",
};

/** Aviso mostrado antes de disparar pelo WhatsApp conectado por QR Code */
export const QR_RISK_TEXT = [
  "O WhatsApp conectado por QR Code não é a API oficial da Meta. Envio em massa vai contra as regras do WhatsApp e pode levar ao BLOQUEIO ou BANIMENTO do número, sem aviso e sem volta.",
  "O risco aumenta quando: o número é novo; as pessoas não conhecem a empresa ou nunca falaram com ela; muitas pessoas bloqueiam ou denunciam; os envios são rápidos ou em grande quantidade; a mensagem é igual para todos.",
  "Para diminuir o risco: envie só para quem já conversou com vocês; use intervalos longos (40 a 120 segundos); limite a quantidade por dia; escreva variações da mensagem; ofereça uma forma de a pessoa pedir para não receber mais.",
  "Para campanhas grandes, use a API Oficial da Meta, com modelos de mensagem aprovados.",
];
