import { modulesAllowedForType, type AccountType, type ModuleKey } from "@/lib/auth/modules";

/** Valida os campos da conta (parceiro/cliente) vindos do formulário */
export function accountValues(
  body: Record<string, unknown>,
  opts: { partial: boolean; childType: AccountType; parentModules: string[] }
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
  return { values } as const;
}
