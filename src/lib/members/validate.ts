import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, memberModules } from "@/db/schema";
import { COVER_MAX } from "./common";

/** Valida uma aula (módulo e arquivos precisam ser do mesmo curso / da conta autora) */
export async function lessonValues(body: Record<string, unknown>, courseId: string, authorAccountId: string) {
  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return { error: "Dê um título à aula" } as const;
  let moduleId = body.moduleId ? String(body.moduleId) : null;
  if (moduleId) {
    const m = await db.query.memberModules.findFirst({ where: and(eq(memberModules.id, moduleId), eq(memberModules.courseId, courseId)) });
    if (!m) moduleId = null;
  }
  const videoUrl = String(body.videoUrl ?? "").trim().slice(0, 500) || null;
  if (videoUrl && !/^https:\/\//i.test(videoUrl)) return { error: "O link do vídeo precisa começar com https://" } as const;
  const wanted = Array.isArray(body.driveFileIds) ? body.driveFileIds.map(String).slice(0, 20) : [];
  const files = wanted.length
    ? await db.select({ id: driveFiles.id }).from(driveFiles).where(and(inArray(driveFiles.id, wanted), eq(driveFiles.accountId, authorAccountId)))
    : [];
  const dur = Math.round(Number(body.durationMin));
  return {
    values: {
      title,
      moduleId,
      description: String(body.description ?? "").trim().slice(0, 5000) || null,
      videoUrl,
      driveFileIds: files.map((f) => f.id),
      durationMin: Number.isFinite(dur) && dur > 0 ? Math.min(dur, 1000) : null,
      premium: body.premium === true,
      published: body.published !== false,
      sort: Math.round(Number(body.sort)) || 0,
    },
  } as const;
}

/** Valida os campos do curso */
export function courseValues(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim().slice(0, 150);
  if (!title) return { error: "Dê um título ao curso" } as const;
  const cover = body.cover ? String(body.cover) : null;
  if (cover && (!cover.startsWith("data:image/") || cover.length > COVER_MAX)) return { error: "Capa inválida ou grande demais (máx. 300 KB)" } as const;
  return {
    values: {
      title,
      description: String(body.description ?? "").trim().slice(0, 2000) || null,
      cover,
      premium: body.premium === true,
      published: body.published !== false,
      sort: Math.round(Number(body.sort)) || 0,
    },
  } as const;
}
