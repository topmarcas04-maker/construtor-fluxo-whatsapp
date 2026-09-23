export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { metaConnections } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { encryptSecret } from "@/lib/tenancy/secret";
import { metaConfigured, publicAppUrl, subscribePage } from "@/lib/meta/graph";
import { clearPending, getPendingPages, listConnections } from "@/lib/meta/server";

/** GET — páginas conectadas, páginas aguardando escolha e situação da configuração */
export async function GET() {
  const auth = await requireUser("redes-sociais");
  if (auth.error) return auth.error;
  const [connections, pending] = await Promise.all([listConnections(auth.accountId), getPendingPages(auth.accountId)]);
  const taken = pending.length
    ? await db.select({ pageId: metaConnections.pageId, accountId: metaConnections.accountId }).from(metaConnections)
    : [];
  const isMaster = auth.user.homeAccount.type === "MASTER";
  return NextResponse.json({
    configured: metaConfigured(),
    canManage: Boolean(auth.user.canManage || auth.user.actingAs),
    setup: isMaster
      ? {
          webhookUrl: publicAppUrl() ? `${publicAppUrl()}/api/meta/webhook` : null,
          redirectUrl: publicAppUrl() ? `${publicAppUrl()}/api/meta/callback` : null,
          hasAppId: Boolean(process.env.META_APP_ID),
          hasAppSecret: Boolean(process.env.META_APP_SECRET),
          hasVerifyToken: Boolean(process.env.META_VERIFY_TOKEN),
          hasPublicUrl: Boolean(process.env.PUBLIC_APP_URL),
        }
      : null,
    connections,
    pending: pending.map((p) => {
      const owner = taken.find((t) => t.pageId === p.id);
      return {
        id: p.id,
        name: p.name,
        igUsername: p.igUsername,
        hasInstagram: Boolean(p.igUserId),
        connectedHere: owner?.accountId === auth.accountId,
        connectedElsewhere: Boolean(owner && owner.accountId !== auth.accountId),
      };
    }),
  });
}

/** POST { pageId } — conecta uma das páginas encontradas no login */
export async function POST(req: NextRequest) {
  const auth = await requireUser("redes-sociais");
  if (auth.error) return auth.error;
  if (!auth.user.canManage && !auth.user.actingAs) {
    return NextResponse.json({ error: "Só o administrador pode conectar o Instagram/Facebook." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.cancel) {
    await clearPending(auth.accountId);
    return NextResponse.json({ ok: true });
  }
  const page = (await getPendingPages(auth.accountId)).find((p) => p.id === String(body.pageId || ""));
  if (!page) return NextResponse.json({ error: "Faça o login do Facebook de novo para escolher a página." }, { status: 400 });

  const existing = await db.query.metaConnections.findFirst({ where: eq(metaConnections.pageId, page.id) });
  if (existing && existing.accountId !== auth.accountId) {
    return NextResponse.json({ error: "Esta página já está conectada em outra conta do sistema." }, { status: 409 });
  }
  try {
    await subscribePage(page.id, page.accessToken);
  } catch (e) {
    return NextResponse.json({ error: `Não consegui ligar a página: ${(e as Error).message}` }, { status: 502 });
  }
  const values = {
    accountId: auth.accountId,
    pageId: page.id,
    pageName: page.name,
    pageTokenEnc: encryptSecret(page.accessToken),
    igUserId: page.igUserId,
    igUsername: page.igUsername,
    status: "connected",
    lastError: null,
  };
  if (existing) await db.update(metaConnections).set(values).where(eq(metaConnections.id, existing.id));
  else await db.insert(metaConnections).values(values);
  await clearPending(auth.accountId);
  return NextResponse.json({ ok: true, connections: await listConnections(auth.accountId) });
}
