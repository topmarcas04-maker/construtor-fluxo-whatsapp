import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { accountServices, accounts, supportCalls } from "@/db/schema";
import { getAccount } from "@/lib/tenancy/server";
import { resolveWhatsappNumber, sendWhatsappMessage } from "@/lib/services/whatsapp/engineClient";
import { normalizeCallHours, spMonthStart } from "./common";

export async function providerSettings(providerId: string) {
  const svc = await db.query.accountServices.findFirst({ where: eq(accountServices.accountId, providerId) });
  return {
    callHours: normalizeCallHours(svc?.callHours),
    callMinutes: svc?.callMinutes || 30,
    callLink: svc?.callLink || "",
    supportPhone: svc?.supportPhone || "",
  };
}

/** Calls já usadas no mês pela conta (agendadas + realizadas + faltas) */
export async function callsUsedThisMonth(clientId: string) {
  const rows = await db
    .select({ id: supportCalls.id })
    .from(supportCalls)
    .where(and(eq(supportCalls.clientAccountId, clientId), gte(supportCalls.startsAt, spMonthStart()), ne(supportCalls.status, "CANCELED")));
  return rows.length;
}

export async function busyCalls(providerId: string) {
  return db
    .select({ startsAt: supportCalls.startsAt, endsAt: supportCalls.endsAt })
    .from(supportCalls)
    .where(and(eq(supportCalls.providerAccountId, providerId), eq(supportCalls.status, "SCHEDULED"), gte(supportCalls.endsAt, new Date())));
}

export async function childIds(providerId: string) {
  return (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.parentId, providerId))).map((a) => a.id);
}


const fmt = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Avisa o cliente (e o suporte de quem atende) pelo WhatsApp de quem atende. Falha em silêncio. */
export async function notifyCall(call: typeof supportCalls.$inferSelect, kind: "booked" | "canceled") {
  try {
    const provider = await getAccount(call.providerAccountId);
    const client = await getAccount(call.clientAccountId);
    const settings = await providerSettings(call.providerAccountId);
    const when = fmt(call.startsAt);
    const link = call.meetingLink || settings.callLink;
    const toClient =
      kind === "booked"
        ? `✅ *Call de acompanhamento confirmada*\n${when}${link ? `\nLink: ${link}` : "\nO link da reunião será enviado antes do horário."}${call.topic ? `\nAssunto: ${call.topic}` : ""}`
        : `❌ Sua call de ${when} foi cancelada. Você pode marcar outra pelo painel, no menu Calls.`;
    const toProvider = `${kind === "booked" ? "📅 *Nova call marcada*" : "❌ *Call cancelada*"}\n${client?.name || ""} — ${call.userName || ""}\n${when}${call.topic ? `\nAssunto: ${call.topic}` : ""}${call.phone ? `\nWhatsApp: ${call.phone}` : ""}`;
    const send = async (phone: string | null | undefined, text: string) => {
      const digits = (phone || "").replace(/\D/g, "");
      if (digits.length < 10 || !provider) return;
      const r = await resolveWhatsappNumber(provider.id, digits.length <= 11 ? `55${digits}` : digits);
      const jid = "jid" in r && r.jid ? r.jid : `${digits.length <= 11 ? `55${digits}` : digits}@s.whatsapp.net`;
      await sendWhatsappMessage(provider.id, jid, text, "AUTO", "Calls");
    };
    await send(call.phone || client?.phone, toClient);
    await send(settings.supportPhone, toProvider);
  } catch (e) {
    console.error("[calls] aviso:", e);
  }
}
