export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { chatbots } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { listChatbots } from "@/lib/chatbot/shared";
import { chatbotValues } from "@/lib/chatbot/validate";
import { chatbotRefs } from "./refs";

/** GET — chatbots da conta + etiquetas, vendedores e colunas para configurar */
export async function GET() {
  const auth = await requireUser("chatbot");
  if (auth.error) return auth.error;
  const [bots, { data }] = await Promise.all([listChatbots(db, auth.accountId), chatbotRefs(auth.accountId)]);
  return NextResponse.json({ bots, ...data });
}

/** POST — novo chatbot */
export async function POST(req: NextRequest) {
  const auth = await requireUser("chatbot");
  if (auth.error) return auth.error;
  const current = await listChatbots(db, auth.accountId);
  if (current.length >= 20) return NextResponse.json({ error: "Máximo de 20 chatbots." }, { status: 400 });
  const { refs } = await chatbotRefs(auth.accountId);
  const parsed = chatbotValues(await req.json(), refs);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [created] = await db
    .insert(chatbots)
    .values({ ...(parsed.values as typeof chatbots.$inferInsert), accountId: auth.accountId, sort: current.length })
    .returning({ id: chatbots.id });
  return NextResponse.json({ id: created.id, bots: await listChatbots(db, auth.accountId) }, { status: 201 });
}
