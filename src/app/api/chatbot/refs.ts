import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings, driveFiles, sellers, tags } from "@/db/schema";
import { storageReady } from "@/lib/storage/s3";
import { funnelsWithColumns } from "@/lib/funnel/shared";
import type { BotRefs } from "@/lib/chatbot/validate";

/** Etiquetas, vendedores e colunas da conta (para a tela e para validar) */
export async function chatbotRefs(accountId: string) {
  const [tagRows, sellerRows, funnels, ai, fileRows] = await Promise.all([
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.accountId, accountId)),
    db.select({ id: sellers.id, name: sellers.name, active: sellers.active }).from(sellers).where(eq(sellers.accountId, accountId)),
    funnelsWithColumns(db, accountId),
    db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId), columns: { enabled: true } }),
    db
      .select({ id: driveFiles.id, name: driveFiles.name, mime: driveFiles.mimeType, size: driveFiles.size, kind: driveFiles.kind })
      .from(driveFiles)
      .where(eq(driveFiles.accountId, accountId)),
  ]);
  const refs: BotRefs = {
    tagIds: new Set(tagRows.map((t) => t.id)),
    sellerIds: new Set(sellerRows.map((s) => s.id)),
    columnIds: new Set(funnels.flatMap((f) => f.columns.map((c) => c.id))),
    files: new Map(fileRows.map((f) => [f.id, { name: f.name, mime: f.mime, size: f.size, kind: f.kind }])),
  };
  return {
    refs,
    data: {
      tags: tagRows,
      sellers: sellerRows.filter((s) => s.active),
      funnels: funnels.map((f) => ({ id: f.id, name: f.name, columns: f.columns.map((c) => ({ id: c.id, name: c.name })) })),
      aiEnabled: Boolean(ai?.enabled),
      /** Bucket configurado (sem ele não dá para usar foto, áudio, vídeo e PDF) */
      storageReady: storageReady(),
    },
  };
}
