import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, messages } from "@/db/schema";

/** Marca a conversa como lida: guarda quantas mensagens do cliente já tinham chegado */
export async function markConversationRead(conversationId: string) {
  await db
    .update(conversations)
    .set({
      lastReadAt: new Date(),
      readInCount: sql`(select count(*) from ${messages} where ${messages.conversationId} = ${conversationId} and ${messages.direction} = 'IN')`,
    })
    .where(eq(conversations.id, conversationId));
}
