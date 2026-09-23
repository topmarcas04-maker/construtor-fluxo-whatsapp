import { actionRefs } from "../actions/validate";

/** Valida os campos do produto vindos do formulário */
export function productValues(body: Record<string, unknown>, partial: boolean) {
  const v: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "Informe o nome do produto" } as const;
    v.name = name.slice(0, 200);
  }
  const money = (x: unknown) => {
    if (x === null || x === undefined || x === "") return null;
    const n = Number(String(x).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  for (const f of ["price", "promoPrice"] as const) {
    if (body[f] !== undefined) {
      const n = money(body[f]);
      if (Number.isNaN(n)) return { error: "Preço inválido" } as const;
      v[f] = n;
    }
  }
  if (body.description !== undefined) v.description = String(body.description || "").slice(0, 5000) || null;
  if (body.code !== undefined) v.code = String(body.code || "").trim().slice(0, 60) || null;
  if (body.active !== undefined) v.active = Boolean(body.active);
  if (body.categoryId !== undefined) v.categoryId = body.categoryId || null;
  if (body.kind !== undefined) v.kind = ["PLAN", "SERVICE"].includes(String(body.kind)) ? String(body.kind) : "PHYSICAL";
  if (body.billingPeriod !== undefined) v.billingPeriod = body.billingPeriod === "YEAR" ? "YEAR" : "MONTH";
  if (body.setupFee !== undefined) {
    const n = money(body.setupFee);
    if (Number.isNaN(n)) return { error: "Taxa de adesão inválida" } as const;
    v.setupFee = n;
  }
  for (const [f, max, label] of [
    ["commitmentMonths", 120, "Fidelidade"],
    ["trialDays", 365, "Teste grátis"],
    ["durationMinutes", 24 * 60, "Duração"],
  ] as const) {
    if (body[f] === undefined) continue;
    const d = body[f] === "" || body[f] === null ? null : Math.round(Number(body[f]));
    if (d !== null && (!Number.isFinite(d) || d < 0 || d > max)) return { error: `${label} inválida` } as const;
    v[f] = d || null;
  }
  if (body.availability !== undefined) v.availability = body.availability === "ORDER" ? "ORDER" : "READY";
  if (body.leadTimeDays !== undefined) {
    const d = body.leadTimeDays === "" || body.leadTimeDays === null ? null : Math.round(Number(body.leadTimeDays));
    if (d !== null && (!Number.isFinite(d) || d < 0 || d > 365)) return { error: "Prazo de entrega inválido (0 a 365 dias)" } as const;
    v.leadTimeDays = d;
  }
  if (body.installments !== undefined) {
    const list = Array.isArray(body.installments) ? body.installments : [];
    const out: { n: number; total: number | null }[] = [];
    for (const it of list.slice(0, 3) as { n?: unknown; total?: unknown }[]) {
      const n = Math.round(Number(it?.n));
      if (!n) continue;
      if (n < 2 || n > 48) return { error: "Parcelas devem ser entre 2x e 48x" } as const;
      const total = money(it?.total);
      if (Number.isNaN(total)) return { error: "Preço a prazo inválido" } as const;
      if (!out.some((o) => o.n === n)) out.push({ n, total });
    }
    v.installments = out.sort((a, b) => a.n - b.n);
  }
  Object.assign(v, actionRefs(body));
  return { values: v } as const;
}

