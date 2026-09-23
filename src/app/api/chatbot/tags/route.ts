export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

const COLORS = ["blue", "green", "orange", "purple", "red", "gray"];

/** POST — cria uma etiqueta direto da tela do chatbot */
export async function POST(req: NextRequest) {
  const auth = await requireUser("chatbot");
  if (auth.error) return auth.error;
  const { name } = await req.json();
  const n = String(name || "").trim().slice(0, 60);
  if (!n) return NextResponse.json({ error: "Informe o nome da etiqueta" }, { status: 400 });
  const exists = await db.query.tags.findFirst({
    where: and(eq(tags.accountId, auth.accountId), sql`lower(${tags.name}) = lower(${n})`),
  });
  if (exists) return NextResponse.json(exists);
  const count = (await db.select({ id: tags.id }).from(tags).where(eq(tags.accountId, auth.accountId))).length;
  const [created] = await db
    .insert(tags)
    .values({ accountId: auth.accountId, name: n, color: COLORS[count % COLORS.length] })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
