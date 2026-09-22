export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { appointments, aiSettings } from "@/db/schema";
import { requireUser, sellerScope } from "@/lib/auth/server";
import { appointmentValues } from "./shared";

/** GET ?from=ISO&to=ISO — agendamentos da conta ativa no período */
export async function GET(req: NextRequest) {
  const auth = await requireUser(["agenda", "leads"]);
  if (auth.error) return auth.error;
  const from = new Date(req.nextUrl.searchParams.get("from") || Date.now() - 31 * 864e5);
  const to = new Date(req.nextUrl.searchParams.get("to") || Date.now() + 62 * 864e5);
  const leadId = req.nextUrl.searchParams.get("leadId");
  const onlySeller = sellerScope(auth.user);

  const where = [eq(appointments.accountId, auth.accountId)];
  if (leadId) where.push(eq(appointments.leadId, leadId));
  else where.push(gte(appointments.startsAt, from), lt(appointments.startsAt, to));
  if (onlySeller) where.push(eq(appointments.sellerId, onlySeller));

  const rows = await db.query.appointments.findMany({
    where: and(...where),
    with: {
      seller: { columns: { id: true, name: true } },
      lead: { columns: { id: true, cardName: true, phone: true }, with: { conversation: { columns: { leadName: true, phoneJid: true } } } },
    },
    orderBy: (a, { asc }) => asc(a.startsAt),
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("agenda");
  if (auth.error) return auth.error;
  const body = await req.json();
  const parsed = await appointmentValues(body, auth.accountId, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Padrões do lembrete vêm das configurações da conta
  const settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId) });
  const v = parsed.values;
  if (v.reminderMessage === undefined) v.reminderMessage = settings?.reminderMessage ?? null;
  if (v.reminderMinutesBefore === undefined) v.reminderMinutesBefore = settings?.reminderMinutesBefore ?? 0;
  if (v.sellerId === undefined && sellerScope(auth.user)) v.sellerId = sellerScope(auth.user);

  const [created] = await db
    .insert(appointments)
    .values({ ...(v as typeof appointments.$inferInsert), accountId: auth.accountId, createdBy: "HUMAN" })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
