export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { pagesFromOAuthCode, publicAppUrl, readState } from "@/lib/meta/graph";
import { savePendingPages } from "@/lib/meta/server";

/** Volta do login do Facebook: guarda as páginas encontradas para a pessoa escolher */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${publicAppUrl() || req.nextUrl.origin}/redes-sociais?${q}`);
  const auth = await requireUser("redes-sociais");
  if (auth.error) return back("erro=" + encodeURIComponent("Faça login no painel e tente de novo."));

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("erro=" + encodeURIComponent("O login do Facebook foi cancelado."));
  const accountId = readState(q.get("state"));
  if (!accountId || accountId !== auth.accountId) {
    return back("erro=" + encodeURIComponent("O login expirou ou foi feito em outra conta. Tente de novo."));
  }
  try {
    const pages = await pagesFromOAuthCode(q.get("code") || "");
    if (!pages.length) {
      return back("erro=" + encodeURIComponent("Nenhuma página encontrada. Marque a página da empresa ao autorizar."));
    }
    await savePendingPages(accountId, pages);
    return back("escolher=1");
  } catch (e) {
    return back("erro=" + encodeURIComponent((e as Error).message || "Falha ao conectar com o Facebook"));
  }
}
