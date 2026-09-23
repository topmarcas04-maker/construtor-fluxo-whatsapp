export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Seller {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
}

export interface LastMessage {
  id: string;
  body: string;
  direction: "IN" | "OUT";
  sentAt: string;
  messageType: string | null;
}

export interface Lead {
  id: string;
  conversationId: string;
  cardName: string | null;
  stage: string;
  /** Coluna personalizada do funil (vazio = coluna do estágio) */
  columnId?: string | null;
  /** Última ação feita pela IA (ex.: "Reservar") */
  lastAction?: string | null;
  lastActionAt?: string | null;
  /** Produto de interesse */
  product?: { id: string; name: string; kind: string } | null;
  city: string | null;
  dealValue: number | null;
  closed: boolean;
  updatedAt: string;
  seller: Seller | null;
  tags: Tag[];
  phone: string | null;
  createdAt: string;
  aiPaused: boolean;
  aiSummary: string | null;
  score: number | null;
  interest: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  note: string | null;
  conversation: {
    phoneJid: string;
    /** WHATSAPP | INSTAGRAM | MESSENGER */
    channel?: string;
    /** @usuario do Instagram */
    handle?: string | null;
    leadName: string | null;
    lastMessageAt: string | null;
  };
  lastMessage: LastMessage | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "IN" | "OUT";
  body: string;
  messageType: string | null;
  sentAt: string;
  /** Endereço para carregar o áudio/foto/vídeo/documento */
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  sender: "LEAD" | "AI" | "HUMAN" | "FLOW" | "AUTO" | null;
  /** Nome de quem enviou pelo painel */
  authorName: string | null;
  /** Texto do áudio (transcrição) */
  transcript?: string | null;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
}

export const SALE_TYPE_LABEL: Record<string, string> = {
  ANY: "Não definido",
  WHOLESALE: "Atacado (revenda)",
  RETAIL: "Varejo (uso próprio)",
};

export const STAGE_LABEL: Record<string, string> = {
  FIRST_CONTACT: "Primeiro contato",
  SECOND_CONTACT: "Segundo contato",
  HOT_LEAD: "Lead quente",
  SALE: "Vendas",
};

/** Nome amigável do lead */
export function leadDisplayName(lead: Lead) {
  const name = lead.conversation.leadName || lead.cardName;
  if (name && name !== "Lead") return name;
  if (lead.phone) return formatPhone(lead.phone);
  const jid = lead.conversation.phoneJid;
  // IDs "@lid" do WhatsApp não são número de telefone
  return jid.endsWith("@lid") ? "Contato do WhatsApp" : formatPhone(jid.split("@")[0]);
}

export function formatPhone(raw: string | null | undefined) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d || "Sem número";
}

export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  MESSENGER: "Facebook",
};

/** Classes do selo do canal */
export const CHANNEL_BADGE: Record<string, string> = {
  WHATSAPP: "bg-emerald-50 text-emerald-700",
  INSTAGRAM: "bg-pink-50 text-pink-700",
  MESSENGER: "bg-blue-50 text-blue-700",
};

/** Linha de contato: telefone (WhatsApp), @usuario (Instagram) ou "Facebook Messenger" */
export function contactLine(lead: Pick<Lead, "phone" | "conversation">) {
  const ch = lead.conversation.channel || "WHATSAPP";
  if (lead.phone) return formatPhone(lead.phone) + (ch !== "WHATSAPP" ? ` · ${CHANNEL_LABEL[ch]}` : "");
  if (ch === "INSTAGRAM") return lead.conversation.handle ? `@${lead.conversation.handle} · Instagram` : "Instagram";
  if (ch === "MESSENGER") return "Facebook Messenger";
  return lead.conversation.phoneJid.split("@")[0];
}

export function timeLabel(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Colunas do funil de SDR, na ordem em que aparecem na tela. */
export const FUNNEL_COLUMNS = [
  { stage: "FIRST_CONTACT", label: "Primeiro contato" },
  { stage: "SECOND_CONTACT", label: "Segundo contato" },
  { stage: "HOT_LEAD", label: "Lead quente" },
  { stage: "SALE", label: "Vendas" },
] as const;

const LEGACY_STAGE_MAP: Record<string, string> = {
  PROSPECT: "FIRST_CONTACT",
  QUALIFIED: "SECOND_CONTACT",
  NEGOTIATING: "HOT_LEAD",
  CLOSED_WON: "SALE",
  CLOSED_LOST: "SALE",
};

/** Normaliza estágios antigos (do funil de vendas genérico) pras 4 colunas do SDR. */
export function funnelColumn(stage: string): string {
  if (FUNNEL_COLUMNS.some((c) => c.stage === stage)) return stage;
  return LEGACY_STAGE_MAP[stage] || "FIRST_CONTACT";
}

export const TAG_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  red: "bg-red-100 text-red-800 border-red-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};

export const TAG_DOT_CLASSES: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  gray: "bg-gray-400",
};
