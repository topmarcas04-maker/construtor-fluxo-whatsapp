export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getOwnProduct } from "@/lib/products/server";
import { storageReady, putObject, deleteObject } from "@/lib/storage/s3";
import { compressVideo, VIDEO_MAX_UPLOAD, VIDEO_MAX_OUTPUT } from "@/lib/storage/video";

/**
 * Vídeo do produto. Fica fora do proxy de login (que limita o tamanho do corpo);
 * a sessão é conferida aqui mesmo pelo requireUser.
 * POST (corpo = o arquivo de vídeo) comprime e guarda no bucket. DELETE remove.
 */

async function guard(id: string) {
  const auth = await requireUser("produtos");
  if (auth.error) return { error: auth.error };
  if (!auth.user.canEditProducts) {
    return { error: NextResponse.json({ error: "Você pode ver os produtos, mas não tem permissão para editar." }, { status: 403 }) };
  }
  const product = await getOwnProduct(auth.accountId, id);
  if (!product) return { error: NextResponse.json({ error: "Produto não encontrado" }, { status: 404 }) };
  return { accountId: auth.accountId, product };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (!storageReady()) {
    return NextResponse.json({ error: "O armazenamento de vídeos não está configurado no servidor (bucket)." }, { status: 400 });
  }
  const type = req.headers.get("content-type") || "";
  if (!/^video\//i.test(type) && type !== "application/octet-stream") {
    return NextResponse.json({ error: "Envie um arquivo de vídeo (MP4, MOV...)." }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > VIDEO_MAX_UPLOAD) {
    return NextResponse.json({ error: "Vídeo muito grande (máximo 200 MB)." }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });

  const dir = await mkdtemp(path.join(tmpdir(), "video-"));
  const input = path.join(dir, "in");
  const output = path.join(dir, "out.mp4");
  try {
    // Grava o upload em disco (sem segurar tudo na memória)
    let total = 0;
    const file = createWriteStream(input);
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > VIDEO_MAX_UPLOAD) {
        file.destroy();
        return NextResponse.json({ error: "Vídeo muito grande (máximo 200 MB)." }, { status: 413 });
      }
      if (!file.write(value)) await new Promise<void>((r) => file.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => file.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (!total) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });

    let result: { seconds: number | null; size: number };
    try {
      result = await compressVideo(input, output);
    } catch (e) {
      console.error("[video] ffmpeg:", (e as Error).message);
      return NextResponse.json({ error: "Não consegui ler esse vídeo. Tente outro arquivo (MP4 ou MOV)." }, { status: 400 });
    }
    if (result.size > VIDEO_MAX_OUTPUT) {
      return NextResponse.json({ error: "Mesmo comprimido o vídeo ficou grande demais. Use um vídeo mais curto." }, { status: 400 });
    }
    const key = `acc/${g.accountId}/products/${id}/video-${Date.now()}.mp4`;
    await putObject(key, await readFile(output), "video/mp4");
    const old = g.product.videoKey;
    const [updated] = await db
      .update(products)
      .set({ videoKey: key, videoBytes: result.size, videoSeconds: result.seconds, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning({ videoKey: products.videoKey, videoBytes: products.videoBytes, videoSeconds: products.videoSeconds });
    if (old && old !== key) await deleteObject(old);
    return NextResponse.json({ ok: true, hasVideo: true, videoBytes: updated.videoBytes, videoSeconds: updated.videoSeconds });
  } catch (e) {
    console.error("[video] upload:", e);
    return NextResponse.json({ error: "Não foi possível salvar o vídeo agora. Tente de novo." }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const old = g.product.videoKey;
  await db
    .update(products)
    .set({ videoKey: null, videoBytes: null, videoSeconds: null, updatedAt: new Date() })
    .where(eq(products.id, id));
  if (old && storageReady()) await deleteObject(old);
  return NextResponse.json({ ok: true });
}
