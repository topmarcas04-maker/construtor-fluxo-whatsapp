/**
 * Horário em que os consultores atendem (horário de Brasília). Sem dependências: tela, site e motor.
 * Fora do horário a IA não promete "já vai te chamar" e a mensagem de transferência avisa quando o
 * consultor retorna.
 */

export interface DayHours {
  open: boolean;
  start: string; // "08:00"
  end: string; // "18:00"
}

export interface SellerHours {
  enabled: boolean;
  /** 0 = domingo ... 6 = sábado */
  days: DayHours[];
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_LOWER = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const DEFAULT_SELLER_HOURS: SellerHours = {
  enabled: false,
  days: [
    { open: false, start: "08:00", end: "12:00" },
    { open: true, start: "08:00", end: "18:00" },
    { open: true, start: "08:00", end: "18:00" },
    { open: true, start: "08:00", end: "18:00" },
    { open: true, start: "08:00", end: "18:00" },
    { open: true, start: "08:00", end: "18:00" },
    { open: true, start: "08:00", end: "12:00" },
  ],
};

export const DEFAULT_AFTER_HOURS =
  "Perfeito! Nosso consultor atende {horario}. Ele vai falar com você {retorno} para continuar seu atendimento, combinado? 😊";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Confere e completa o que veio da tela/banco */
export function normalizeSellerHours(v: unknown): SellerHours {
  const o = (v && typeof v === "object" ? v : {}) as Partial<SellerHours>;
  const days = DEFAULT_SELLER_HOURS.days.map((def, i) => {
    const d = (Array.isArray(o.days) ? o.days[i] : null) as Partial<DayHours> | null;
    const start = typeof d?.start === "string" && TIME.test(d.start) ? d.start : def.start;
    const end = typeof d?.end === "string" && TIME.test(d.end) ? d.end : def.end;
    return { open: typeof d?.open === "boolean" ? d.open : def.open, start, end: end > start ? end : def.end > start ? def.end : "23:59" };
  });
  return { enabled: o.enabled === true, days };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const label = (hhmm: string) => (hhmm.endsWith(":00") ? `${Number(hhmm.slice(0, 2))}h` : `${Number(hhmm.slice(0, 2))}h${hhmm.slice(3)}`);

/** Dia da semana e minuto do dia em Brasília */
function spNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const h = Number(get("hour")) % 24;
  return { weekday: wd < 0 ? 0 : wd, minute: h * 60 + Number(get("minute")) };
}

/** "segunda a sexta das 8h às 18h e sábado das 8h às 12h" */
export function hoursText(h: SellerHours) {
  const groups: { from: number; to: number; start: string; end: string }[] = [];
  // Começa na segunda para agrupar "segunda a sexta"
  for (const i of [1, 2, 3, 4, 5, 6, 0]) {
    const d = h.days[i];
    if (!d.open) continue;
    const last = groups[groups.length - 1];
    const prev = last ? (last.to + 1) % 7 : -1;
    if (last && prev === i && last.start === d.start && last.end === d.end) last.to = i;
    else groups.push({ from: i, to: i, start: d.start, end: d.end });
  }
  if (!groups.length) return "em horário comercial";
  const parts = groups.map((g) => {
    const days = g.from === g.to ? WEEKDAYS_LOWER[g.from] : `${WEEKDAYS_LOWER[g.from].replace("-feira", "")} a ${WEEKDAYS_LOWER[g.to].replace("-feira", "")}`;
    return `${days} das ${label(g.start)} às ${label(g.end)}`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
}

/** Os consultores estão atendendo agora? Se não, quando voltam ("amanhã a partir das 8h") */
export function sellerAvailability(h: SellerHours, now = new Date()) {
  if (!h.enabled) return { open: true, hoursText: null as string | null, nextOpen: null as string | null };
  const { weekday, minute } = spNow(now);
  const today = h.days[weekday];
  if (today.open && minute >= minutes(today.start) && minute < minutes(today.end)) {
    return { open: true, hoursText: hoursText(h), nextOpen: null };
  }
  let nextOpen: string | null = null;
  for (let k = 0; k < 8; k++) {
    const wd = (weekday + k) % 7;
    const d = h.days[wd];
    if (!d.open) continue;
    if (k === 0 && minute >= minutes(d.start)) continue; // já fechou hoje
    const when = k === 0 ? "hoje" : k === 1 ? "amanhã" : WEEKDAYS_LOWER[wd] === "sábado" || WEEKDAYS_LOWER[wd] === "domingo" ? `no ${WEEKDAYS_LOWER[wd]}` : `na ${WEEKDAYS_LOWER[wd]}`;
    nextOpen = `${when} a partir das ${label(d.start)}`;
    break;
  }
  return { open: false, hoursText: hoursText(h), nextOpen: nextOpen || "no próximo dia útil" };
}
