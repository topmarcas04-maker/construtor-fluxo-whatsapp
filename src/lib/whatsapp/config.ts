/**
 * Configuração de cada WhatsApp da conta (1, 2 ou 3). Sem imports "@/": usado no site e no motor.
 * Tudo vazio = o número usa o padrão da conta (todos os produtos, todos os vendedores, funil padrão).
 */
export interface WaNumberConfig {
  /** Produtos que a IA oferece neste número (vazio = todos) */
  productIds: string[];
  /** Vendedores que recebem os leads deste número (vazio = regras normais da distribuição) */
  sellerIds: string[];
  /** Funil em que entram os leads novos deste número (null = funil padrão) */
  funnelId: string | null;
  /** Orientação extra para a IA só neste número (ex.: "aqui você atende pós-venda") */
  aiInstructions: string;
}

export const EMPTY_WA_CONFIG: WaNumberConfig = { productIds: [], sellerIds: [], funnelId: null, aiInstructions: "" };

export function normalizeWaConfig(raw: unknown): WaNumberConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 64))].slice(0, 500) : []);
  return {
    productIds: ids(r.productIds),
    sellerIds: ids(r.sellerIds),
    funnelId: typeof r.funnelId === "string" && r.funnelId ? r.funnelId : null,
    aiInstructions: typeof r.aiInstructions === "string" ? r.aiInstructions.trim().slice(0, 1500) : "",
  };
}

/** O número tem alguma regra própria? */
export function hasOwnRules(c: WaNumberConfig) {
  return c.productIds.length > 0 || c.sellerIds.length > 0 || Boolean(c.funnelId) || Boolean(c.aiInstructions);
}
