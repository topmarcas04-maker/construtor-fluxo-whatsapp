export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, memberProgress } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { lessonAccess } from "@/lib/members/server";
import { signedUrl, storageReady } from "@/lib/storage/s3";

/** Abre o vídeo da aula (?file=<id> abre um material de apoio) */
export async function GET(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await lessonAccess(auth.user, id);
  if (!acc || acc.locked || !storageReady()) return NextResponse.json({ error: "Aula indisponível" }, { status: 404 });
  const fileId = req.nextUrl.searchParams.get("file");
  if (fileId) {
    if (!(acc.lesson.driveFileIds || []).includes(fileId)) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 404 });
    const f = await db.query.driveFiles.findFirst({ where: and(eq(driveFiles.id, fileId), eq(driveFiles.accountId, acc.course.accountId)) });
    if (!f) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 404 });
    return NextResponse.redirect(await signedUrl(f.storageKey, 3600), 302);
  }
  if (!acc.lesson.videoKey) return NextResponse.json({ error: "Aula sem vídeo" }, { status: 404 });
  return NextResponse.redirect(await signedUrl(acc.lesson.videoKey, 4 * 3600), 302);
}

/** Marca ({ done: true }) ou desmarca a aula como concluída */
export async function POST(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await lessonAccess(auth.user, id);
  if (!acc || acc.locked) return NextResponse.json({ error: "Aula indisponível" }, { status: 404 });
  const done = (await req.json()).done !== false;
  if (done) await db.insert(memberProgress).values({ userId: auth.user.id, lessonId: id }).onConflictDoNothing();
  else await db.delete(memberProgress).where(and(eq(memberProgress.userId, auth.user.id), eq(memberProgress.lessonId, id)));
  return NextResponse.json({ ok: true, done });
}
