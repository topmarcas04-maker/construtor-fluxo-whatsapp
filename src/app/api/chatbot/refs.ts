import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings, sellers, tags } from "@/db/schema";
import { funnelsWithColumns } from "@/lib/funnel/shared";
import type { BotRefs } from "@/lib/chatbot/validate";

/** Etiquetas, vendedores e colunas da conta (para a tela e para validar) */
export async function chatbotRefs(accountId: string) {
  const [tagRows, sellerRows, funnels, ai] = await Promise.all([
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.accountId, accountId)),
    db.select({ id: sellers.id, name: sellers.name, active: sellers.active }).from(sellers).where(eq(sellers.accountId, accountId)),
    funnelsWithColumns(db, accountId),
    db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { enabled: true } }),
  ]);
  const refs: BotRefs = {
    tagIds: new Set(tagRows.map((t) => t.id)),
    sellerIds: new Set(sellerRows.map((s) => s.id)),
    columnIds: new Set(funnels.flatMap((f) => f.columns.map((c) => c.id))),
  };
  return {
    refs,
    data: {
      tags: tagRows,
      sellers: sellerRows.filter((s) => s.active),
      funnels: funnels.map((f) => ({ id: f.id, name: f.name, columns: f.columns.map((c) => ({ id: c.id, name: c.name })) })),
      aiEnabled: Boolean(ai?.enabled),
    },
  };
}
