export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socialPosts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { readPostBody } from "@/lib/social/server";

async function own(accountId: string, id: string) {
  return db.query.socialPosts.findFirst({ where: and(eq(socialPosts.id, id), eq(socialPosts.accountId, accountId)) });
}

/**
 * PATCH — edita a postagem que ainda não foi publicada.
 * { action: "retry" } tenta de novo o que deu erro (mantém o que já foi publicado);
 * { action: "cancel" } cancela o agendamento.
 */
export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("postagens");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const post = await own(auth.accountId, id);
  if (!post) return NextResponse.json({ error: "Postagem não encontrada" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (body.action === "cancel") {
    if (post.status !== "SCHEDULED") return NextResponse.json({ error: "Só dá para cancelar postagem agendada." }, { status: 400 });
    const [row] = await db.update(socialPosts).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(socialPosts.id, id)).returning();
    return NextResponse.json(row);
  }
  if (body.action === "retry") {
    if (post.status !== "ERROR" && post.status !== "PARTIAL") return NextResponse.json({ error: "Esta postagem não teve erro." }, { status: 400 });
    const [row] = await db
      .update(socialPosts)
      .set({ status: "SCHEDULED", scheduledAt: new Date(), updatedAt: new Date() })
      .where(eq(socialPosts.id, id))
      .returning();
    return NextResponse.json(row);
  }

  if (post.status === "PUBLISHING" || post.status === "PUBLISHED" || post.status === "PARTIAL") {
    return NextResponse.json({ error: "Esta postagem já foi publicada e não pode ser editada." }, { status: 400 });
  }
  const r = await readPostBody(auth.accountId, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const [row] = await db
    .update(socialPosts)
    .set({ ...r.values, status: "SCHEDULED", results: {}, updatedAt: new Date() })
    .where(eq(socialPosts.id, id))
    .returning();
  return NextResponse.json(row);
}

/** DELETE — apaga do sistema (o que já foi publicado continua no Instagram/Facebook) */
export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("postagens");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const post = await own(auth.accountId, id);
  if (!post) return NextResponse.json({ error: "Postagem não encontrada" }, { status: 404 });
  if (post.status === "PUBLISHING") return NextResponse.json({ error: "Está publicando agora. Espere terminar." }, { status: 400 });
  await db.delete(socialPosts).where(eq(socialPosts.id, id));
  return NextResponse.json({ ok: true });
}
