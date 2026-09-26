/**
 * Agentes de IA: cada conta pode ter vários agentes, cada um com função, instruções,
 * qualificação, produtos, ações e permissões próprias. Sem imports "@/": usado no site e no motor.
 *
 * O "Agente Principal" nasce da IA que a conta já tinha (mesmas instruções, estilo e qualificação)
 * e continua sincronizado com a tela Configurações → Agentes de IA.
 */

export const AGENT_ROLES = [
  { key: "RECEPCAO", label: "Recepção", objective: "Receber o cliente, entender o que ele precisa e encaminhar." },
  { key: "SDR", label: "SDR / Qualificação", objective: "Qualificar o lead e entregar ao vendedor com os dados completos." },
  { key: "VENDAS", label: "Vendas", objective: "Apresentar produtos, tirar dúvidas e conduzir o cliente até a compra." },
  { key: "AGENDAMENTO", label: "Agendamento", objective: "Marcar visitas, reuniões e serviços na agenda." },
  { key: "FINANCEIRO", label: "Financeiro", objective: "Tirar dúvidas de pagamento, parcelamento e financiamento." },
  { key: "POS_VENDA", label: "Pós-venda", objective: "Acompanhar o cliente depois da compra: revisão, garantia e satisfação." },
  { key: "SUPORTE", label: "Suporte", objective: "Resolver dúvidas e problemas de quem já é cliente." },
  { key: "COBRANCA", label: "Cobrança", objective: "Lembrar pagamentos em aberto com educação e combinar a regularização." },
  { key: "CUSTOM", label: "Personalizado", objective: "" },
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number]["key"];

export function roleLabel(role: string, custom?: string | null) {
  if (role === "CUSTOM" && custom?.trim()) return custom.trim();
  return AGENT_ROLES.find((r) => r.key === role)?.label || "Personalizado";
}

/** O que o agente pode fazer. Tudo ligado = igual à IA de antes. */
export interface AgentPermissions {
  /** Consultar o catálogo de produtos */
  catalog: boolean;
  /** Informar preço */
  price: boolean;
  /** Informar parcelamento */
  installments: boolean;
  /** Enviar fotos dos produtos */
  photos: boolean;
  /** Enviar vídeos dos produtos */
  videos: boolean;
  /** Marcar horários na agenda */
  schedule: boolean;
  /** Mover o card no funil */
  moveFunnel: boolean;
  /** Colocar etiquetas no lead */
  tags: boolean;
  /** Passar o cliente para um vendedor */
  handoffSeller: boolean;
}

export const PERMISSION_LIST: { key: keyof AgentPermissions; label: string; hint: string }[] = [
  { key: "catalog", label: "Consultar produtos", hint: "Vê o catálogo (nome, descrição, estoque)." },
  { key: "price", label: "Informar preço", hint: "Sem isso, o preço fica com o vendedor." },
  { key: "installments", label: "Informar parcelamento", hint: "Parcelas e condições de pagamento do catálogo." },
  { key: "photos", label: "Enviar fotos", hint: "Fotos dos produtos, por cor." },
  { key: "videos", label: "Enviar vídeos", hint: "Vídeo do produto quando houver." },
  { key: "schedule", label: "Agendar", hint: "Marca horários na agenda (visita, reunião, ligação)." },
  { key: "moveFunnel", label: "Mover no funil", hint: "Move o card para colunas com regra." },
  { key: "tags", label: "Colocar etiquetas", hint: "Usa as etiquetas da conta." },
  { key: "handoffSeller", label: "Passar para vendedor", hint: "Transfere para a fila de vendedores." },
];

export const ALL_PERMISSIONS: AgentPermissions = {
  catalog: true,
  price: true,
  installments: true,
  photos: true,
  videos: true,
  schedule: true,
  moveFunnel: true,
  tags: true,
  handoffSeller: true,
};

export function normalizePermissions(raw: unknown): AgentPermissions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...ALL_PERMISSIONS };
  for (const k of Object.keys(out) as (keyof AgentPermissions)[]) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return out;
}

/** Campos do agente que mudam o jeito de atender */
export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  roleCustom: string | null;
  objective: string | null;
  description: string | null;
  instructions: string;
  style: string;
  styleCustom: string | null;
  replyLength: string;
  emojiLevel: string;
  offerVideo: boolean;
  qualify: unknown;
  productIds: string[];
  categoryIds: string[];
  actionIds: string[];
  permissions: AgentPermissions;
  isPrimary: boolean;
  active: boolean;
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 64))].slice(0, 500) : []);

/** Converte a linha do banco (jsonb solto) no perfil do agente */
export function toProfile(row: Record<string, unknown>): AgentProfile {
  return {
    id: String(row.id),
    name: String(row.name || "Agente"),
    role: String(row.role || "CUSTOM"),
    roleCustom: (row.roleCustom as string) || null,
    objective: (row.objective as string) || null,
    description: (row.description as string) || null,
    instructions: String(row.instructions || ""),
    style: String(row.style || "FRIENDLY"),
    styleCustom: (row.styleCustom as string) || null,
    replyLength: String(row.replyLength || "MEDIUM"),
    emojiLevel: String(row.emojiLevel || "LOW"),
    offerVideo: row.offerVideo !== false,
    qualify: row.qualify ?? null,
    productIds: ids(row.productIds),
    categoryIds: ids(row.categoryIds),
    actionIds: ids(row.actionIds),
    permissions: normalizePermissions(row.permissions),
    isPrimary: row.isPrimary === true,
    active: row.active !== false,
  };
}

/** Instruções que vão para a IA: as do agente + função e objetivo (internos, o cliente não vê) */
export function agentSystemPrompt(a: Pick<AgentProfile, "name" | "role" | "roleCustom" | "objective" | "instructions">, fallback: string) {
  const role = roleLabel(a.role, a.roleCustom);
  const head = [
    `[Sua função neste atendimento: ${role}.`,
    a.objective?.trim() ? `Objetivo: ${a.objective.trim().replace(/[.!?]?$/, ".")}` : null,
    "Não diga ao cliente o nome da sua função nem que você é um agente.]",
  ]
    .filter(Boolean)
    .join(" ");
  return `${a.instructions?.trim() || fallback}\n\n${head}`;
}

/** Tira do item do catálogo o que o agente não pode informar */
export function restrictCatalogItem<T extends { price: string; installments?: string[] }>(item: T, p: AgentPermissions): T {
  let out = item;
  if (!p.price) out = { ...out, price: "(o preço é informado pelo vendedor)", installments: [] };
  if (!p.installments) out = { ...out, installments: [] };
  return out;
}

/** Tira da decisão da IA o que o agente não pode fazer */
export function restrictDecision<
  D extends {
    productCodes: unknown[];
    videoCode: string | null;
    appointment: unknown;
    columnName: string | null;
    tags: string[];
    handoff: boolean;
  },
>(d: D, p: AgentPermissions): D {
  if (!p.photos) d.productCodes = [];
  if (!p.videos) d.videoCode = null;
  if (!p.schedule) d.appointment = null;
  if (!p.moveFunnel) d.columnName = null;
  if (!p.tags) d.tags = [];
  if (!p.handoffSeller) d.handoff = false;
  return d;
}

export const MAX_AGENTS_LIMIT = 20;
