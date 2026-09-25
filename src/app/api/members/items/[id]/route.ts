export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberLessons, memberModules } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { courseAccess } from "@/lib/members/server";
import { lessonValues } from "@/lib/members/validate";
import { deleteObject, storageReady } from "@/lib/storage/s3";

/** Módulo (?type=module) ou aula (?type=lesson): editar e apagar */
async function load(req: NextRequest, id: string) {
  const auth = await requireUser("aulas");
  if (auth.error) return { error: auth.error };
  const type = req.nextUrl.searchParams.get("type") === "module" ? "module" : "lesson";
  const row =
    type === "module"
      ? await db.query.memberModules.findFirst({ where: eq(memberModules.id, id) })
      : await db.query.memberLessons.findFirst({ where: eq(memberLessons.id, id) });
  if (!row) return { error: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) };
  const acc = await courseAccess(auth.user, row.courseId);
  if (!acc?.canEdit) return { error: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) };
  return { type, row, acc } as const;
}

export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const { id } = await c.params;
  const l = await load(req, id);
  if ("error" in l) return l.error;
  const body = await req.json();
  if (l.type === "module") {
    const title = String(body.title ?? "").trim().slice(0, 150);
    if (!title) return NextResponse.json({ error: "Dê um título ao módulo" }, { status: 400 });
    const [row] = await db.update(memberModules).set({ title, sort: Math.round(Number(body.sort)) || 0 }).where(eq(memberModules.id, id)).returning();
    return NextResponse.json(row);
  }
  const v = await lessonValues(body, l.row.courseId, l.acc.course.accountId);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const [row] = await db.update(memberLessons).set(v.values).where(eq(memberLessons.id, id)).returning();
  const { videoKey, ...rest } = row;
  return NextResponse.json({ ...rest, hasVideo: Boolean(videoKey) });
}

export async function DELETE(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const { id } = await c.params;
  const l = await load(req, id);
  if ("error" in l) return l.error;
  if (l.type === "module") {
    const vids = await db.select({ k: memberLessons.videoKey }).from(memberLessons).where(eq(memberLessons.moduleId, id));
    if (storageReady()) for (const v of vids) if (v.k) await deleteObject(v.k);
    await db.delete(memberModules).where(eq(memberModules.id, id));
  } else {
    const key = (l.row as typeof memberLessons.$inferSelect).videoKey;
    if (key && storageReady()) await deleteObject(key);
    await db.delete(memberLessons).where(eq(memberLessons.id, id));
  }
  return NextResponse.json({ ok: true });
}
