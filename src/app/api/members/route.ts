export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { memberCourses, memberLessons, memberProgress } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { coursesVisible, viewerContext } from "@/lib/members/server";
import { courseValues } from "@/lib/members/validate";

/** Cursos que a conta vê, com progresso e se estão bloqueados (premium) */
export async function GET() {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { ctx, rows } = await coursesVisible(auth.user);
  const ids = rows.map((c) => c.id);
  const lessons = ids.length
    ? await db
        .select({ id: memberLessons.id, courseId: memberLessons.courseId, published: memberLessons.published, durationMin: memberLessons.durationMin })
        .from(memberLessons)
        .where(inArray(memberLessons.courseId, ids))
    : [];
  const lessonIds = lessons.map((l) => l.id);
  const done = lessonIds.length
    ? await db
        .select({ lessonId: memberProgress.lessonId })
        .from(memberProgress)
        .where(and(eq(memberProgress.userId, auth.user.id), inArray(memberProgress.lessonId, lessonIds)))
    : [];
  const doneSet = new Set(done.map((d) => d.lessonId));
  return NextResponse.json({
    canAuthor: ctx.canAuthor,
    premium: ctx.premium,
    courses: rows
      .sort((a, b) => a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => {
        const own = c.accountId === auth.accountId;
        const ls = lessons.filter((l) => l.courseId === c.id && (l.published || own));
        return {
          ...c,
          own,
          locked: c.premium && !own && !ctx.premium,
          lessons: ls.length,
          minutes: ls.reduce((s, l) => s + (l.durationMin || 0), 0),
          completed: ls.filter((l) => doneSet.has(l.id)).length,
        };
      }),
  });
}

/** Novo curso */
export async function POST(req: NextRequest) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const ctx = await viewerContext(auth.user);
  if (!ctx.canAuthor) return NextResponse.json({ error: "Só o administrador do Master ou do Parceiro cria cursos" }, { status: 403 });
  const v = courseValues(await req.json());
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const [row] = await db.insert(memberCourses).values({ ...v.values, accountId: auth.accountId }).returning();
  return NextResponse.json(row, { status: 201 });
}
