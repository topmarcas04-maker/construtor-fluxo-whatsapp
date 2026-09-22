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
  return { values: v } as const;
}

