import { ACTION_KINDS } from "./common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function actionValues(body: Record<string, unknown>, partial: boolean) {
  const v: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return { error: "Dê um nome para a ação" } as const;
    v.name = name;
  }
  if (!partial || body.kind !== undefined) {
    v.kind = (ACTION_KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) : "INFO";
  }
  if (body.instructions !== undefined) v.instructions = String(body.instructions || "").trim().slice(0, 2000) || null;
  if (body.appointmentTitle !== undefined) v.appointmentTitle = String(body.appointmentTitle || "").trim().slice(0, 120) || null;
  if (body.appointmentMinutes !== undefined) {
    const n = body.appointmentMinutes === "" || body.appointmentMinutes === null ? null : Math.round(Number(body.appointmentMinutes));
    if (n !== null && (!Number.isFinite(n) || n < 5 || n > 600)) return { error: "Duração inválida (5 a 600 minutos)" } as const;
    v.appointmentMinutes = n;
  }
  if (body.columnId !== undefined) v.columnId = body.columnId && UUID.test(String(body.columnId)) ? String(body.columnId) : null;
  if (body.handoff !== undefined) v.handoff = Boolean(body.handoff);
  if (body.active !== undefined) v.active = Boolean(body.active);
  return { values: v } as const;
}

/** Lista de ações de um produto/categoria: ids válidos (máx. 10) e a principal entre eles */
export function actionRefs(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.actionIds !== undefined) {
    const ids = Array.isArray(body.actionIds) ? body.actionIds.map(String).filter((x) => UUID.test(x)) : [];
    out.actionIds = [...new Set(ids)].slice(0, 10);
  }
  if (body.primaryActionId !== undefined) {
    const p = String(body.primaryActionId || "");
    out.primaryActionId = UUID.test(p) ? p : null;
  }
  if (out.actionIds && out.primaryActionId && !(out.actionIds as string[]).includes(out.primaryActionId as string)) {
    out.primaryActionId = null;
  }
  return out;
}
