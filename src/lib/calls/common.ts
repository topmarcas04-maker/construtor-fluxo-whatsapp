/** Calls de acompanhamento — horários livres. Sem dependências (tela e site) */
import { DEFAULT_SELLER_HOURS, normalizeSellerHours, type SellerHours } from "../ai/hours";

export const CALL_MIN_LEAD_HOURS = 2;
export const CALL_DAYS_AHEAD = 14;

export const CALL_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendada",
  DONE: "Realizada",
  CANCELED: "Cancelada",
  NO_SHOW: "Não compareceu",
};

export function normalizeCallHours(v: unknown): SellerHours {
  const h = normalizeSellerHours(v ?? { ...DEFAULT_SELLER_HOURS, enabled: true });
  return { ...h, enabled: true };
}

function spDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Começo do mês atual (horário de Brasília) */
export function spMonthStart(now = new Date()) {
  return new Date(`${spDate(now).slice(0, 7)}-01T00:00:00-03:00`);
}

/** Horários livres nos próximos dias, sem bater com calls já marcadas */
export function availableSlots(
  hours: SellerHours,
  minutes: number,
  busy: { startsAt: Date; endsAt: Date }[],
  now = new Date(),
  days = CALL_DAYS_AHEAD
) {
  const step = Math.max(15, Math.min(240, minutes || 30));
  const earliest = now.getTime() + CALL_MIN_LEAD_HOURS * 3600e3;
  const out: { date: string; slots: string[] }[] = [];
  for (let i = 0; i <= days; i++) {
    const date = spDate(new Date(now.getTime() + i * 864e5));
    const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
    const d = hours.days[weekday];
    if (!d?.open) continue;
    const slots: string[] = [];
    let t = new Date(`${date}T${d.start}:00-03:00`).getTime();
    const end = new Date(`${date}T${d.end}:00-03:00`).getTime();
    for (; t + step * 60e3 <= end; t += step * 60e3) {
      if (t < earliest) continue;
      const e = t + step * 60e3;
      if (busy.some((b) => t < b.endsAt.getTime() && e > b.startsAt.getTime())) continue;
      slots.push(new Date(t).toISOString());
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}
