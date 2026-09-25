export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, supportCalls } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getAccount } from "@/lib/tenancy/server";
import { availableSlots } from "@/lib/calls/common";
import { busyCalls, callsUsedThisMonth, childIds, notifyCall, providerSettings } from "@/lib/calls/server";

/**
 * Tela de calls: quem tem calls no plano vê os horários livres de quem o cadastrou e as próprias calls;
 * quem cadastra contas (Master/Parceiro) vê as calls marcadas com ele e configura os horários.
 */
export async function GET() {
  const auth = await requireUser("calls");
  if (auth.error) return auth.error;
  const me = await getAccount(auth.accountId);
  if (!me) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // Como cliente (marca com a conta mãe)
  let booking = null;
  if (me.parentId && me.type !== "MASTER") {
    const limit = me.callsPerMonth || 0;
    const used = await callsUsedThisMonth(me.id);
    const settings = await providerSettings(me.parentId);
    const provider = await getAccount(me.parentId);
    const mine = await db
      .select()
      .from(supportCalls)
      .where(eq(supportCalls.clientAccountId, me.id))
      .orderBy(desc(supportCalls.startsAt))
      .limit(50);
    booking = {
      provider: provider?.name || "",
      limit,
      used,
      minutes: settings.callMinutes,
      slots: limit > used ? availableSlots(settings.callHours, settings.callMinutes, await busyCalls(me.parentId)) : [],
      calls: mine.map((c) => ({ ...c, meetingLink: c.meetingLink || settings.callLink || null })),
      phone: me.phone || "",
    };
  }

  // Como quem atende
  let providing = null;
  if (me.type !== "CLIENT" && auth.user.canManage) {
    const kids = await childIds(me.id);
    const rows = kids.length
      ? await db
          .select({ call: supportCalls, clientName: accounts.name })
          .from(supportCalls)
          .innerJoin(accounts, eq(accounts.id, supportCalls.clientAccountId))
          .where(and(eq(supportCalls.providerAccountId, me.id), gte(supportCalls.startsAt, new Date(Date.now() - 30 * 864e5))))
          .orderBy(supportCalls.startsAt)
      : [];
    const settings = await providerSettings(me.id);
    providing = {
      settings: { callHours: settings.callHours, callMinutes: settings.callMinutes, callLink: settings.callLink },
      calls: rows.map((r) => ({ ...r.call, clientName: r.clientName })),
    };
  }
  return NextResponse.json({ booking, providing });
}

/** Marca uma call */
export async function POST(req: NextRequest) {
  const auth = await requireUser("calls");
  if (auth.error) return auth.error;
  const me = await getAccount(auth.accountId);
  if (!me?.parentId || me.type === "MASTER") return NextResponse.json({ error: "Sua conta não marca calls" }, { status: 403 });
  const limit = me.callsPerMonth || 0;
  if ((await callsUsedThisMonth(me.id)) >= limit) {
    return NextResponse.json({ error: limit ? "Você já usou todas as calls do mês." : "Seu plano não inclui calls de acompanhamento." }, { status: 400 });
  }
  const body = await req.json();
  const start = new Date(String(body.startsAt || ""));
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Escolha um horário" }, { status: 400 });
  const settings = await providerSettings(me.parentId);
  const free = availableSlots(settings.callHours, settings.callMinutes, await busyCalls(me.parentId));
  if (!free.some((d) => d.slots.includes(start.toISOString()))) {
    return NextResponse.json({ error: "Esse horário não está mais livre. Escolha outro." }, { status: 409 });
  }
  const phone = String(body.phone ?? me.phone ?? "").replace(/\D/g, "").slice(0, 15) || null;
  const [call] = await db
    .insert(supportCalls)
    .values({
      providerAccountId: me.parentId,
      clientAccountId: me.id,
      userName: auth.user.name,
      phone,
      startsAt: start,
      endsAt: new Date(start.getTime() + settings.callMinutes * 60e3),
      topic: String(body.topic ?? "").trim().slice(0, 1000) || null,
      meetingLink: settings.callLink || null,
    })
    .returning();
  await notifyCall(call, "booked");
  return NextResponse.json(call, { status: 201 });
}
