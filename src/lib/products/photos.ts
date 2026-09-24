/**
 * Fotos de produto vindas de fora (link da planilha): baixa, confere e diminui se precisar.
 * As fotos ficam guardadas como data URL (até ~1,1 MB cada).
 */
const MAX_DATA_URL = 1_500_000;
const MAX_DOWNLOAD = 12 * 1024 * 1024;

export function validPhotoDataUrl(v: unknown): v is string {
  return typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= MAX_DATA_URL;
}

async function shrink(buf: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    return null;
  }
}

/** Link direto do Google Drive ("/file/d/ID/view") vira link de download */
function directLink(url: string) {
  const m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{10,})/.exec(url);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

export async function photoFromUrl(url: string): Promise<{ dataUrl: string } | { error: string }> {
  try {
    const res = await fetch(directLink(url), { signal: AbortSignal.timeout(20000), redirect: "follow" });
    if (!res.ok) return { error: `não consegui baixar a foto (${res.status})` };
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) return { error: "foto grande demais (máx. 12 MB)" };
    if (!/^image\//.test(type) && !/\.(jpe?g|png|webp)(\?|$)/i.test(url)) return { error: "o link não é de uma imagem" };
    let out: Buffer = buf;
    let mime = /png|webp/.test(type) ? type : "image/jpeg";
    const tooBig = () => Math.ceil(out.length / 3) * 4 + 30 > MAX_DATA_URL;
    if (tooBig() || !/^image\/(jpeg|png|webp)$/.test(type)) {
      const small = await shrink(buf);
      if (!small) return { error: "não consegui ler a imagem" };
      out = small;
      mime = "image/jpeg";
    }
    if (tooBig()) return { error: "foto grande demais" };
    return { dataUrl: `data:${mime};base64,${out.toString("base64")}` };
  } catch (e) {
    return { error: `não consegui baixar a foto (${(e as Error).name === "TimeoutError" ? "demorou demais" : "link inválido"})` };
  }
}
