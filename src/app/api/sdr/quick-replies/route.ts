export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quickReplies } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireUser(["leads", "configuracoes"]);
  if (auth.error) return auth.error;
  const all = await db.query.quickReplies.findMany({
    where: eq(quickReplies.accountId, auth.accountId),
    orderBy: (q, { asc }) => asc(q.shortcut),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { shortcut, message } = await req.json();
  if (!shortcut || !message) {
    return NextResponse.json({ error: "Informe o atalho e a mensagem" }, { status: 400 });
  }
  const [created] = await db
    .insert(quickReplies)
    .values({
      accountId: auth.accountId,
      shortcut: String(shortcut).replace(/^\/+/, "").trim().slice(0, 60),
      message: String(message),
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
