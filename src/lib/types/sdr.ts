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
  city: string | null;
  dealValue: number | null;
  closed: boolean;
  updatedAt: string;
  seller: Seller | null;
  tags: Tag[];
  conversation: {
    phoneJid: string;
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
  mediaDataUrl: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
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
