export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { markConversationRead } from "@/lib/sdr/read";

/** POST — marca a conversa como lida */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), eq(conversations.accountId, auth.accountId)),
    columns: { id: true },
  });
  if (conv) await markConversationRead(conv.id);
  return NextResponse.json({ ok: true });
}
