export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { memberLessons, memberModules } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { courseAccess } from "@/lib/members/server";
import { lessonValues } from "@/lib/members/validate";

/** Cria módulo ({ type: "module", title }) ou aula ({ type: "lesson", ... }) no curso */
export async function POST(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("aulas");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const acc = await courseAccess(auth.user, id);
  if (!acc?.canEdit) return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 });
  const body = await req.json();
  if (body.type === "module") {
    const title = String(body.title ?? "").trim().slice(0, 150);
    if (!title) return NextResponse.json({ error: "Dê um título ao módulo" }, { status: 400 });
    const [row] = await db.insert(memberModules).values({ courseId: id, title, sort: Math.round(Number(body.sort)) || 0 }).returning();
    return NextResponse.json(row, { status: 201 });
  }
  const v = await lessonValues(body, id, acc.course.accountId);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const [row] = await db.insert(memberLessons).values({ ...v.values, courseId: id }).returning();
  return NextResponse.json(row, { status: 201 });
}
