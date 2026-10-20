export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { socialPosts } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { listConnections } from "@/lib/meta/server";
import { storageReady } from "@/lib/storage/s3";
import { readPostBody } from "@/lib/social/server";

/** GET ?from=ISO&to=ISO — postagens do período, páginas conectadas e situação do bucket */
export async function GET(req: NextRequest) {
  const auth = await requireUser("postagens");
  if (auth.error) return auth.error;
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get("from") || Date.now() - 31 * 86400_000);
  const to = new Date(sp.get("to") || Date.now() + 62 * 86400_000);
  const [posts, connections] = await Promise.all([
    db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.accountId, auth.accountId), gte(socialPosts.scheduledAt, from), lt(socialPosts.scheduledAt, to)))
      .orderBy(desc(socialPosts.scheduledAt))
      .limit(500),
    listConnections(auth.accountId),
  ]);
  return NextResponse.json({
    posts,
    connections: connections.map((c) => ({ id: c.id, pageName: c.pageName, igUsername: c.igUsername, hasInstagram: Boolean(c.igUserId) })),
    storageReady: storageReady(),
    canConnect: Boolean(auth.user.canManage || auth.user.actingAs),
  });
}

/** POST — cria a postagem (agendada ou para publicar agora) */
export async function POST(req: NextRequest) {
  const auth = await requireUser("postagens");
  if (auth.error) return auth.error;
  if (!storageReady()) return NextResponse.json({ error: "O armazenamento de arquivos (bucket) não está configurado no servidor." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const r = await readPostBody(auth.accountId, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const [row] = await db
    .insert(socialPosts)
    .values({ accountId: auth.accountId, ...r.values, status: "SCHEDULED", createdBy: auth.user.name })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
