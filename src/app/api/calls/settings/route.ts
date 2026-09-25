export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { accountServices } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { normalizeCallHours } from "@/lib/calls/common";

/** Horários, duração e link das calls que esta conta atende */
export async function PUT(req: NextRequest) {
  const auth = await requireUser("calls");
  if (auth.error) return auth.error;
  if (auth.user.account.type === "CLIENT" || !auth.user.canManage) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const body = await req.json();
  const link = String(body.callLink ?? "").trim().slice(0, 500) || null;
  if (link && !/^https:\/\//i.test(link)) return NextResponse.json({ error: "O link precisa começar com https://" }, { status: 400 });
  const values = {
    callHours: normalizeCallHours(body.callHours),
    callMinutes: Math.max(15, Math.min(240, Math.round(Number(body.callMinutes)) || 30)),
    callLink: link,
    updatedAt: new Date(),
  };
  await db
    .insert(accountServices)
    .values({ accountId: auth.accountId, ...values })
    .onConflictDoUpdate({ target: accountServices.accountId, set: values });
  return NextResponse.json({ ok: true });
}
