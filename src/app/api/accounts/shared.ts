import { modulesAllowedForType, type AccountType, type ModuleKey } from "@/lib/auth/modules";
import { normalizeBenefits, type PlanBenefits } from "@/lib/plans/shared";

/** Valida os campos da conta (parceiro/cliente) vindos do formulário */
export function accountValues(
  body: Record<string, unknown>,
  opts: { partial: boolean; childType: AccountType; parentModules: string[]; ceiling?: PlanBenefits; planIds?: string[] }
) {
  const values: Record<string, unknown> = {};
  const str = (v: unknown, max: number) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, max) || null);

  if (!opts.partial || body.name !== undefined) {
    const name = str(body.name, 200);
    if (!name) return { error: "Informe o nome" } as const;
    values.name = name;
  }
  const fields: [string, number][] = [
    ["responsible", 150],
    ["email", 200],
    ["phone", 40],
    ["city", 120],
    ["document", 30],
    ["notes", 2000],
  ];
  for (const [f, max] of fields) {
    const v = str(body[f], max);
    if (v !== undefined) values[f] = v;
  }
  if (body.commission !== undefined) {
    const n = body.commission === "" || body.commission === null ? null : Number(body.commission);
    values.commission = n === null || Number.isNaN(n) ? null : n;
  }
  if (body.modules !== undefined) {
    if (!Array.isArray(body.modules)) return { error: "Menus inválidos" } as const;
    const allowed = modulesAllowedForType(opts.childType) as string[];
    // Só pode liberar o que a própria conta tem
    values.modules = body.modules
      .map(String)
      .filter((m) => allowed.includes(m) && opts.parentModules.includes(m)) as ModuleKey[];
  }
  if (body.aiSource !== undefined) {
    const s = String(body.aiSource);
    if (!["OWN", "PARENT", "NONE"].includes(s)) return { error: "Opção de IA inválida" } as const;
    values.aiSource = s;
  }
  if (body.active !== undefined) values.active = Boolean(body.active);
  if (body.leadEdit !== undefined) values.leadEdit = Boolean(body.leadEdit);
  if (body.productEdit !== undefined) values.productEdit = Boolean(body.productEdit);
  // Plano (só os planos da conta mãe) e benefícios (nunca acima do que a conta mãe tem)
  if (body.planId !== undefined) {
    const planId = body.planId ? String(body.planId) : null;
    if (planId && !(opts.planIds || []).includes(planId)) return { error: "Plano inválido" } as const;
    values.planId = planId;
  }
  if (["maxWhatsapp", "maxAgents", "callsPerMonth", "supportAccess", "premiumAccess"].some((k) => body[k] !== undefined)) {
    Object.assign(values, normalizeBenefits(body as never, opts.ceiling));
  }
  return { values } as const;
}
