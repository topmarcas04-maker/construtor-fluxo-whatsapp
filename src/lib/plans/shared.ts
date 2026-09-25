/**
 * Planos: modelo de menus + benefícios que o Master (ou o Parceiro) oferece às contas que cadastra.
 * Os benefícios ficam copiados na conta (accounts.max_whatsapp etc.), então o plano é só um atalho:
 * dá para ajustar uma conta sem mexer no plano. Seguro para o navegador.
 */

export const MAX_WHATSAPP_LIMIT = 3;

export interface PlanBenefits {
  maxWhatsapp: number;
  callsPerMonth: number;
  supportAccess: boolean;
  premiumAccess: boolean;
}

export interface Plan extends PlanBenefits {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  modules: string[];
  sort: number;
  active: boolean;
}

export const DEFAULT_BENEFITS: PlanBenefits = { maxWhatsapp: 1, callsPerMonth: 0, supportAccess: false, premiumAccess: false };

/** Benefícios da conta Master: tudo liberado */
export const MASTER_BENEFITS: PlanBenefits = { maxWhatsapp: MAX_WHATSAPP_LIMIT, callsPerMonth: 0, supportAccess: false, premiumAccess: true };

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** Valida benefícios vindos de um formulário, sem passar do que a conta mãe tem */
export function normalizeBenefits(v: Partial<Record<keyof PlanBenefits, unknown>>, ceiling?: PlanBenefits | null): PlanBenefits {
  const maxWa = ceiling ? ceiling.maxWhatsapp : MAX_WHATSAPP_LIMIT;
  return {
    maxWhatsapp: int(v.maxWhatsapp, 1, maxWa, 1),
    callsPerMonth: int(v.callsPerMonth, 0, 30, 0),
    supportAccess: v.supportAccess === true,
    premiumAccess: v.premiumAccess === true && (!ceiling || ceiling.premiumAccess),
  };
}

export function benefitsText(b: PlanBenefits) {
  return [
    `${b.maxWhatsapp} WhatsApp${b.maxWhatsapp > 1 ? "s" : ""}`,
    b.callsPerMonth ? `${b.callsPerMonth} call${b.callsPerMonth > 1 ? "s" : ""}/mês` : null,
    b.supportAccess ? "Suporte WhatsApp" : null,
    b.premiumAccess ? "Área premium" : null,
  ].filter(Boolean) as string[];
}
