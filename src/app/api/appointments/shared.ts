import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, sellers } from "@/db/schema";
import { fromSpDateTime } from "@/lib/time";

const STATUSES = ["SCHEDULED", "DONE", "CANCELED", "NO_SHOW"];

/** Valida os campos do agendamento (todos opcionais no PATCH) */
export async function appointmentValues(body: Record<string, unknown>, accountId: string, partial: boolean) {
  const v: Record<string, unknown> = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) return { error: "Informe o assunto do agendamento" } as const;
    v.title = title.slice(0, 200);
  }
  if (!partial || body.date !== undefined || body.time !== undefined) {
    const starts = fromSpDateTime(String(body.date ?? ""), String(body.time ?? ""));
    if (!starts) return { error: "Informe data e hora válidas" } as const;
    v.startsAt = starts;
  }
  if (body.notes !== undefined) v.notes = String(body.notes || "") || null;
  if (body.durationMinutes !== undefined) v.durationMinutes = Math.max(5, Math.min(600, Number(body.durationMinutes) || 30));
  if (body.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) return { error: "Status inválido" } as const;
    v.status = body.status;
  }
  if (body.leadId !== undefined) {
    if (body.leadId) {
      const lead = await db.query.leads.findFirst({
        where: and(eq(leads.id, String(body.leadId)), eq(leads.accountId, accountId)),
      });
      if (!lead) return { error: "Lead inválido" } as const;
    }
    v.leadId = body.leadId || null;
  }
  if (body.sellerId !== undefined) {
    if (body.sellerId) {
      const s = await db.query.sellers.findFirst({
        where: and(eq(sellers.id, String(body.sellerId)), eq(sellers.accountId, accountId)),
      });
      if (!s) return { error: "Vendedor inválido" } as const;
    }
    v.sellerId = body.sellerId || null;
  }
  if (body.reminderEnabled !== undefined) v.reminderEnabled = Boolean(body.reminderEnabled);
  if (body.reminderMessage !== undefined) v.reminderMessage = String(body.reminderMessage || "") || null;
  if (body.reminderMinutesBefore !== undefined) {
    v.reminderMinutesBefore = Math.max(0, Math.min(1440, Number(body.reminderMinutesBefore) || 0));
  }
  return { values: v } as const;
}
