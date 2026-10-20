export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { metaConfigured, oauthDialogUrl, signState } from "@/lib/meta/graph";

/** GET — abre o login do Facebook para escolher a página (e o Instagram ligado a ela) */
export async function GET(req: NextRequest) {
  // ?posts=1: pede também as permissões de publicar (tela Postagens)
  const posts = req.nextUrl.searchParams.get("posts") === "1";
  const auth = await requireUser(posts ? ["redes-sociais", "postagens"] : "redes-sociais");
  if (auth.error) return auth.error;
  if (!auth.user.canManage && !auth.user.actingAs) {
    return NextResponse.json({ error: "Só o administrador pode conectar o Instagram/Facebook." }, { status: 403 });
  }
  if (!metaConfigured()) {
    return NextResponse.json({ error: "O app da Meta ainda não foi configurado no servidor." }, { status: 400 });
  }
  return NextResponse.redirect(oauthDialogUrl(signState(auth.accountId), posts));
}
