import { HHMM, messageVariations, normalizeFilters } from "./common";

/** Valida o formulário de um disparo novo */
export function broadcastValues(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) return { error: "Dê um nome ao disparo" } as const;
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!messageVariations(message).length) return { error: "Escreva a mensagem" } as const;
  if (body.acceptRisk !== true) return { error: "Confirme que leu e entendeu os riscos de bloqueio" } as const;
  let minDelay = Math.round(Number(body.minDelay)) || 40;
  let maxDelay = Math.round(Number(body.maxDelay)) || 120;
  minDelay = Math.max(15, Math.min(3600, minDelay));
  maxDelay = Math.max(minDelay, Math.min(3600, maxDelay));
  const windowStart = HHMM.test(String(body.windowStart)) ? String(body.windowStart) : "08:00";
  const windowEnd = HHMM.test(String(body.windowEnd)) ? String(body.windowEnd) : "20:00";
  const dailyLimit = Math.max(1, Math.min(2000, Math.round(Number(body.dailyLimit)) || 200));
  let scheduledAt: Date | null = null;
  if (body.scheduledAt) {
    const d = new Date(String(body.scheduledAt));
    if (Number.isNaN(d.getTime())) return { error: "Data de início inválida" } as const;
    scheduledAt = d;
  }
  const driveFileId = body.driveFileId ? String(body.driveFileId) : null;
  return {
    values: { name, message, minDelay, maxDelay, windowStart, windowEnd, dailyLimit, scheduledAt, driveFileId, filters: normalizeFilters(body.filters) },
  } as const;
}
