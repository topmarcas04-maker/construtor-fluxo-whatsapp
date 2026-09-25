export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, memberCourses, memberLessons, memberModules, memberProgress } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { courseAccess } from "@/lib/members/server";
import { deleteObject, storageReady } from "@/lib/storage/s3";
import { courseValues } from "@/lib/members/validate";

/** Curso com módulos e aulas (aulas bloqueadas vêm sem o vídeo) */
export async function GET(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await courseAccess(auth.user, id);
  if (!acc) return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 });
  const [modules, lessons] = await Promise.all([
    db.select().from(memberModules).where(eq(memberModules.courseId, id)).orderBy(asc(memberModules.sort)),
    db.select().from(memberLessons).where(eq(memberLessons.courseId, id)).orderBy(asc(memberLessons.sort), asc(memberLessons.createdAt)),
  ]);
  const visible = lessons.filter((l) => l.published || acc.canEdit);
  const done = visible.length
    ? await db
        .select({ lessonId: memberProgress.lessonId })
        .from(memberProgress)
        .where(and(eq(memberProgress.userId, auth.user.id), inArray(memberProgress.lessonId, visible.map((l) => l.id))))
    : [];
  const fileIds = [...new Set(visible.flatMap((l) => l.driveFileIds || []))];
  const files = fileIds.length
    ? await db
        .select({ id: driveFiles.id, name: driveFiles.name, kind: driveFiles.kind, size: driveFiles.size })
        .from(driveFiles)
        .where(and(inArray(driveFiles.id, fileIds), eq(driveFiles.accountId, acc.course.accountId)))
    : [];
  const doneSet = new Set(done.map((d) => d.lessonId));
  return NextResponse.json({
    course: { ...acc.course, locked: acc.course.premium && !acc.premiumOk },
    canEdit: acc.canEdit,
    modules,
    lessons: visible.map(({ videoKey, ...l }) => {
      const locked = (acc.course.premium || l.premium) && !acc.premiumOk;
      return {
        ...l,
        hasVideo: Boolean(videoKey),
        videoUrl: locked ? null : l.videoUrl,
        locked,
        done: doneSet.has(l.id),
        files: locked ? [] : files.filter((f) => (l.driveFileIds || []).includes(f.id)),
      };
    }),
  });
}

export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await courseAccess(auth.user, id);
  if (!acc?.canEdit) return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 });
  const v = courseValues(await req.json());
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const [row] = await db.update(memberCourses).set(v.values).where(eq(memberCourses.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await courseAccess(auth.user, id);
  if (!acc?.canEdit) return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 });
  const vids = await db.select({ k: memberLessons.videoKey }).from(memberLessons).where(eq(memberLessons.courseId, id));
  if (storageReady()) for (const v of vids) if (v.k) await deleteObject(v.k);
  await db.delete(memberCourses).where(eq(memberCourses.id, id));
  return NextResponse.json({ ok: true });
}
