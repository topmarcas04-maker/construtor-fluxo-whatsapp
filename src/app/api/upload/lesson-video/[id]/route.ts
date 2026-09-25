export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@/db/client";
import { memberLessons } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { lessonAccess } from "@/lib/members/server";
import { deleteObject, putObject, storageReady } from "@/lib/storage/s3";
import { LESSON_VIDEO_MAX } from "@/lib/members/common";

/**
 * Vídeo da aula (sem compressão, até 1 GB). Fora do proxy de login; a sessão é conferida aqui.
 * POST (corpo = o vídeo) guarda no bucket. DELETE remove.
 */
async function guard(id: string) {
  const auth = await requireUser("aulas");
  if (auth.error) return { error: auth.error };
  const acc = await lessonAccess(auth.user, id);
  if (!acc?.canEdit) return { error: NextResponse.json({ error: "Aula não encontrada" }, { status: 404 }) };
  return { acc };
}

export async function POST(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const { id } = await c.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (!storageReady()) return NextResponse.json({ error: "O armazenamento de vídeos não está configurado no servidor (bucket)." }, { status: 400 });
  const type = (req.headers.get("content-type") || "").split(";")[0];
  if (!/^video\//i.test(type)) return NextResponse.json({ error: "Envie um arquivo de vídeo (MP4 de preferência)." }, { status: 400 });
  if (Number(req.headers.get("content-length") || 0) > LESSON_VIDEO_MAX) return NextResponse.json({ error: "Vídeo muito grande (máximo 1 GB)." }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  const dir = await mkdtemp(path.join(tmpdir(), "lesson-"));
  const input = path.join(dir, "in");
  try {
    let total = 0;
    const file = createWriteStream(input);
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LESSON_VIDEO_MAX) {
        file.destroy();
        return NextResponse.json({ error: "Vídeo muito grande (máximo 1 GB)." }, { status: 413 });
      }
      if (!file.write(value)) await new Promise<void>((r) => file.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => file.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (!total) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
    const key = `acc/${g.acc.course.accountId}/aulas/${id}-${Date.now()}.${type.split("/")[1] || "mp4"}`;
    await putObject(key, await readFile(input), type);
    const old = g.acc.lesson.videoKey;
    await db.update(memberLessons).set({ videoKey: key }).where(eq(memberLessons.id, id));
    if (old && old !== key) await deleteObject(old);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[aulas] upload:", e);
    return NextResponse.json({ error: "Não foi possível salvar o vídeo agora. Tente de novo." }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const { id } = await c.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (g.acc.lesson.videoKey && storageReady()) await deleteObject(g.acc.lesson.videoKey);
  await db.update(memberLessons).set({ videoKey: null }).where(eq(memberLessons.id, id));
  return NextResponse.json({ ok: true });
}
