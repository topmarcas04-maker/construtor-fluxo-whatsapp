/** Validação dos campos do parceiro (usada no POST e no PATCH) */
export function partnerValues(body: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};
  const str = (v: unknown, max: number) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, max) || null);

  if (!partial || body.name !== undefined) {
    const name = str(body.name, 200);
    if (!name) return { error: "Informe o nome do parceiro" } as const;
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
  if (body.active !== undefined) values.active = Boolean(body.active);
  return { values } as const;
}
