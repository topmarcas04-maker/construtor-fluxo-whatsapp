export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatbots, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { listChatbots } from "@/lib/chatbot/shared";
import { chatbotValues } from "@/lib/chatbot/validate";
import { chatbotRefs } from "../refs";

async function own(id: string, accountId: string) {
  return db.query.chatbots.findFirst({ where: and(eq(chatbots.id, id), eq(chatbots.accountId, accountId)) });
}

/** PUT — salva o chatbot inteiro. Com { active } apenas, só liga/desliga. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("chatbot");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!(await own(id, auth.accountId))) return NextResponse.json({ error: "Chatbot não encontrado" }, { status: 404 });
  const body = await req.json();
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    await db.update(chatbots).set({ active: body.active, updatedAt: new Date() }).where(eq(chatbots.id, id));
  } else {
    const { refs } = await chatbotRefs(auth.accountId);
    const parsed = chatbotValues(body, refs);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await db
      .update(chatbots)
      .set({ ...(parsed.values as Partial<typeof chatbots.$inferInsert>), updatedAt: new Date() })
      .where(eq(chatbots.id, id));
  }
  // Desligado: quem estava no meio do menu sai dele
  if (body.active === false) {
    await db.update(leads).set({ botId: null, botStep: null, botTries: 0 }).where(eq(leads.botId, id));
  }
  return NextResponse.json({ bots: await listChatbots(db, auth.accountId) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("chatbot");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!(await own(id, auth.accountId))) return NextResponse.json({ error: "Chatbot não encontrado" }, { status: 404 });
  await db.delete(chatbots).where(eq(chatbots.id, id));
  return NextResponse.json({ bots: await listChatbots(db, auth.accountId) });
}
