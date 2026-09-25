export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { accountServices } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getAccount } from "@/lib/tenancy/server";
import { supportFor } from "@/lib/plans/server";

/** Suporte que a conta ativa recebe (WhatsApp de quem a cadastrou), se o plano dá direito */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const account = await getAccount(auth.accountId);
  return NextResponse.json({ support: account ? await supportFor(account) : null });
}

/** Salva o WhatsApp de suporte que ESTA conta oferece às contas que cadastra */
export async function PUT(req: NextRequest) {
  const auth = await requireUser("planos");
  if (auth.error) return auth.error;
  const body = await req.json();
  const phone = String(body.supportPhone ?? "").replace(/\D/g, "").slice(0, 15) || null;
  if (phone && phone.length < 10) return NextResponse.json({ error: "Informe o WhatsApp com DDD" }, { status: 400 });
  const values = {
    supportPhone: phone,
    supportHours: String(body.supportHours ?? "").trim().slice(0, 160) || null,
    updatedAt: new Date(),
  };
  await db
    .insert(accountServices)
    .values({ accountId: auth.accountId, ...values })
    .onConflictDoUpdate({ target: accountServices.accountId, set: values });
  return NextResponse.json({ ok: true, ...values });
}
