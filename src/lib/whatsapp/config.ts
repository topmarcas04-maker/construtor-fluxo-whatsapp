/**
 * Configuração de cada WhatsApp da conta (1, 2 ou 3). Sem imports "@/": usado no site e no motor.
 * Tudo vazio = o número usa o padrão da conta (agente principal, todos os vendedores, funil padrão).
 * Produtos e orientação da IA agora ficam no Agente de IA escolhido para o número.
 */
export interface WaNumberConfig {
  /** Agente de IA que atende as conversas novas deste número (null = agente principal) */
  agentId: string | null;
  /** Vendedores que recebem os leads deste número (vazio = regras normais da distribuição) */
  sellerIds: string[];
  /** Funil em que entram os leads novos deste número (null = funil padrão) */
  funnelId: string | null;
}

export const EMPTY_WA_CONFIG: WaNumberConfig = { agentId: null, sellerIds: [], funnelId: null };

export function normalizeWaConfig(raw: unknown): WaNumberConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 64))].slice(0, 500) : []);
  return {
    agentId: typeof r.agentId === "string" && r.agentId ? r.agentId : null,
    sellerIds: ids(r.sellerIds),
    funnelId: typeof r.funnelId === "string" && r.funnelId ? r.funnelId : null,
  };
}

/** O número tem alguma regra própria? */
export function hasOwnRules(c: WaNumberConfig) {
  return Boolean(c.agentId) || c.sellerIds.length > 0 || Boolean(c.funnelId);
}
