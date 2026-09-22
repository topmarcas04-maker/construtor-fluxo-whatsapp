export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireUser(["leads", "configuracoes", "permissoes", "agenda", "visao-geral"]);
  if (auth.error) return auth.error;
  const all = await db.query.sellers.findMany({
    where: eq(sellers.accountId, auth.accountId),
    orderBy: (s, { asc }) => asc(s.name),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { name, phone } = await req.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: "Informe o nome" }, { status: 400 });
  const [created] = await db
    .insert(sellers)
    .values({
      accountId: auth.accountId,
      name: String(name).trim(),
      phone: phone ? String(phone).replace(/\D/g, "") : null,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
