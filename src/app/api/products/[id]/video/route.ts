export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getOwnProduct } from "@/lib/products/server";
import { storageReady, signedUrl } from "@/lib/storage/s3";

/** GET — abre o vídeo do produto (link temporário do bucket) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["produtos", "leads"]);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const product = await getOwnProduct(auth.accountId, id);
  if (!product?.videoKey || !storageReady()) return NextResponse.json({ error: "Sem vídeo" }, { status: 404 });
  return NextResponse.redirect(await signedUrl(product.videoKey, 3600), 302);
}
