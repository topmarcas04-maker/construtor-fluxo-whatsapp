export interface Appointment {
  id: string;
  leadId: string | null;
  sellerId: string | null;
  title: string;
  notes: string | null;
  startsAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "DONE" | "CANCELED" | "NO_SHOW";
  reminderEnabled: boolean;
  reminderMessage: string | null;
  reminderMinutesBefore: number;
  reminderSentAt: string | null;
  reminderError: string | null;
  createdBy: "AI" | "HUMAN";
  seller: { id: string; name: string } | null;
  lead: {
    id: string;
    cardName: string | null;
    phone: string | null;
    conversation: { leadName: string | null; phoneJid: string } | null;
  } | null;
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  DONE: "Realizado",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  NO_SHOW: "bg-red-50 text-red-600 border-red-200",
};

export const REMINDER_OPTIONS = [
  { value: 0, label: "Na hora marcada" },
  { value: 15, label: "15 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];

export function appointmentLeadName(a: Appointment) {
  const n = a.lead?.cardName && a.lead.cardName !== "Lead" ? a.lead.cardName : a.lead?.conversation?.leadName;
  return n || (a.lead ? "Cliente" : "Sem cliente");
}

const TZ = "America/Sao_Paulo";
/** Partes da data no horário de Brasília */
export function spParts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}

export function todaySp() {
  return spParts(new Date()).date;
}
