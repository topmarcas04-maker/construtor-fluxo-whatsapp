export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireUser(["leads", "configuracoes", "agenda"]);
  if (auth.error) return auth.error;
  const all = await db.query.tags.findMany({
    where: eq(tags.accountId, auth.accountId),
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { name, color } = await req.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: "Informe o nome" }, { status: 400 });
  const [created] = await db
    .insert(tags)
    .values({ accountId: auth.accountId, name: String(name).trim().slice(0, 60), color: color || "blue" })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
