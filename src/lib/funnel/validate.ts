import { COLUMN_COLORS } from "./common";

/** Quem pode criar/renomear/apagar colunas: administradores (ou quem está "acessando" a conta) */
export function canManageColumns(user: { canManage: boolean; actingAs?: unknown }) {
  return Boolean(user.canManage || user.actingAs);
}

export function columnValues(body: Record<string, unknown>, partial: boolean) {
  const values: Record<string, unknown> = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return { error: "Dê um nome para a coluna" } as const;
    values.name = name;
  }
  if (body.aiRule !== undefined) values.aiRule = String(body.aiRule || "").trim().slice(0, 500) || null;
  if (body.color !== undefined) {
    const c = String(body.color || "");
    values.color = (COLUMN_COLORS as readonly string[]).includes(c) ? c : null;
  }
  return { values } as const;
}
