/**
 * Datas no horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão desde 2019).
 * Sem imports "@/": usado também pelo motor.
 */
export const TZ = "America/Sao_Paulo";

/** "2026-09-25" + "14:30" (horário de Brasília) → Date */
export function fromSpDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":");
  const d = new Date(`${date}T${h.padStart(2, "0")}:${m}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → { date: "2026-09-25", time: "14:30" } no horário de Brasília */
export function toSpParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

export function formatSpDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatSpTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** Troca {nome} {data} {hora} {assunto} {vendedor} no texto do lembrete */
export function fillTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString());
}
