/**
 * Área de membros no servidor: quem vê cada curso, quem edita e quem tem o premium.
 * Um curso criado pela conta X aparece para X e para todas as contas abaixo dela
 * que têm o menu "Área de membros". Conteúdo premium só abre para quem tem o premium no plano.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { memberCourses, memberLessons } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/server";
import { getAccount } from "@/lib/tenancy/server";

/** A conta e as contas acima dela (quem pode ter criado cursos que ela vê) */
export async function lineage(accountId: string) {
  const ids: string[] = [];
  let cur = await getAccount(accountId);
  for (let i = 0; cur && i < 8; i++) {
    ids.push(cur.id);
    cur = await getAccount(cur.parentId);
  }
  return ids;
}

export async function viewerContext(user: CurrentUser) {
  const account = await getAccount(user.account.id);
  const ids = await lineage(user.account.id);
  return {
    accountIds: ids,
    /** Pode criar cursos: administrador de Master/Parceiro (conteúdo para as contas abaixo) */
    canAuthor: user.canManage && user.account.type !== "CLIENT",
    premium: user.account.type === "MASTER" || Boolean(account?.premiumAccess),
  };
}

/** O curso é visível para o usuário? (e se ele pode editar) */
export async function courseAccess(user: CurrentUser, courseId: string) {
  const course = await db.query.memberCourses.findFirst({ where: eq(memberCourses.id, courseId) });
  if (!course) return null;
  const ctx = await viewerContext(user);
  if (!ctx.accountIds.includes(course.accountId)) return null;
  const own = course.accountId === user.account.id;
  const canEdit = own && ctx.canAuthor;
  if (!course.published && !canEdit) return null;
  // Quem criou sempre vê tudo; os demais precisam do premium para o conteúdo premium
  const premiumOk = own || ctx.premium;
  return { course, canEdit, premiumOk, ctx };
}

export async function lessonAccess(user: CurrentUser, lessonId: string) {
  const lesson = await db.query.memberLessons.findFirst({ where: eq(memberLessons.id, lessonId) });
  if (!lesson) return null;
  const acc = await courseAccess(user, lesson.courseId);
  if (!acc) return null;
  const locked = (acc.course.premium || lesson.premium) && !acc.premiumOk;
  if (!lesson.published && !acc.canEdit) return null;
  return { ...acc, lesson, locked };
}

export async function coursesVisible(user: CurrentUser) {
  const ctx = await viewerContext(user);
  const rows = await db.select().from(memberCourses).where(inArray(memberCourses.accountId, ctx.accountIds));
  return { ctx, rows: rows.filter((c) => c.published || (c.accountId === user.account.id && ctx.canAuthor)) };
}

