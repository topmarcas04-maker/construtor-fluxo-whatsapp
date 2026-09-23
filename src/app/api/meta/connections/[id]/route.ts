export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { metaConnections } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { unsubscribePage } from "@/lib/meta/graph";
import { connectionToken, listConnections, ownConnection } from "@/lib/meta/server";

async function guard(id: string) {
  const auth = await requireUser("redes-sociais");
  if (auth.error) return { error: auth.error } as const;
  if (!auth.user.canManage && !auth.user.actingAs) {
    return { error: NextResponse.json({ error: "Só o administrador pode alterar esta conexão." }, { status: 403 }) } as const;
  }
  const row = await ownConnection(auth.accountId, id);
  if (!row) return { error: NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 }) } as const;
  return { auth, row } as const;
}

/** PATCH { messengerEnabled?, instagramEnabled? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const set: Record<string, unknown> = {};
  if (typeof body.messengerEnabled === "boolean") set.messengerEnabled = body.messengerEnabled;
  if (typeof body.instagramEnabled === "boolean") set.instagramEnabled = body.instagramEnabled;
  if (Object.keys(set).length) await db.update(metaConnections).set(set).where(eq(metaConnections.id, id));
  return NextResponse.json(await listConnections(g.auth.accountId));
}

/** DELETE — desconecta a página (as conversas continuam salvas) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const token = connectionToken(g.row);
  if (token) await unsubscribePage(g.row.pageId, token).catch(() => {});
  await db.delete(metaConnections).where(eq(metaConnections.id, id));
  return NextResponse.json(await listConnections(g.auth.accountId));
}
