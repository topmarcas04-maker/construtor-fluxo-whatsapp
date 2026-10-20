import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, metaConnections } from "@/db/schema";
import { postProblem, type PostFormat, type PostMedia } from "./common";

const FORMATS: PostFormat[] = ["REEL", "FEED", "CAROUSEL", "STORY"];

/** Confere e limpa o que veio do formulário. Devolve { error } ou os valores para salvar. */
export async function readPostBody(accountId: string, body: Record<string, unknown>) {
  const format = String(body.format || "") as PostFormat;
  if (!FORMATS.includes(format)) return { error: "Escolha o formato: Reels, Feed, Carrossel ou Stories." };
  const connectionId = String(body.connectionId || "");
  const conn = connectionId
    ? await db.query.metaConnections.findFirst({ where: and(eq(metaConnections.id, connectionId), eq(metaConnections.accountId, accountId)) })
    : null;
  if (!conn) return { error: "Escolha a página do Facebook / Instagram." };

  const ids = (Array.isArray(body.media) ? body.media : []).map((m) => String((m as { fileId?: string })?.fileId || "")).filter(Boolean).slice(0, 10);
  const files = ids.length
    ? await db.select().from(driveFiles).where(and(eq(driveFiles.accountId, accountId), inArray(driveFiles.id, ids)))
    : [];
  const media: PostMedia[] = ids
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is (typeof files)[number] => Boolean(f))
    .map((f) => ({ fileId: f.id, kind: f.kind, mime: f.mimeType, name: f.name }));
  if (media.length !== ids.length) return { error: "Algum arquivo escolhido não existe mais no Drive." };

  const caption = format === "STORY" ? "" : String(body.caption || "").replace(/\r\n/g, "\n");
  const toInstagram = Boolean(body.toInstagram);
  const toFacebook = Boolean(body.toFacebook);
  const problem = postProblem({ format, toInstagram, toFacebook, caption, media, hasInstagram: Boolean(conn.igUserId) });
  if (problem) return { error: problem };

  let scheduledAt = new Date();
  if (!body.now) {
    const d = new Date(String(body.scheduledAt || ""));
    if (isNaN(d.getTime())) return { error: "Escolha a data e a hora da publicação." };
    if (d.getTime() < Date.now() - 60_000) return { error: "A data escolhida já passou. Escolha um horário futuro ou \"Publicar agora\"." };
    if (d.getTime() > Date.now() + 75 * 86400_000) return { error: "Agende para no máximo 75 dias à frente." };
    scheduledAt = d;
  }
  return { values: { connectionId: conn.id, format, toInstagram, toFacebook, caption, media, scheduledAt } };
}
