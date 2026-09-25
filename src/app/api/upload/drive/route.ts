export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { driveFiles, driveFolders } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { putObject, storageReady } from "@/lib/storage/s3";
import { DRIVE_MAX_FILE, kindOf, safeFileName } from "@/lib/drive/common";

/**
 * Envio de arquivo para o Drive. Fica fora do proxy de login (que limita o tamanho do corpo);
 * a sessão é conferida aqui pelo requireUser.
 * POST /api/upload/drive?folderId=...&name=... (corpo = o arquivo; Content-Type = tipo do arquivo)
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  if (!storageReady()) {
    return NextResponse.json({ error: "O armazenamento de arquivos não está configurado no servidor (bucket)." }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > DRIVE_MAX_FILE) return NextResponse.json({ error: "Arquivo muito grande (máximo 100 MB)." }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const name = (sp.get("name") || "arquivo").trim().slice(0, 200) || "arquivo";
  let folderId = sp.get("folderId") || null;
  if (folderId) {
    const folder = await db.query.driveFolders.findFirst({ where: and(eq(driveFolders.id, folderId), eq(driveFolders.accountId, auth.accountId)) });
    if (!folder) folderId = null;
  }
  const mime = (req.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().slice(0, 120);

  const dir = await mkdtemp(path.join(tmpdir(), "drive-"));
  const input = path.join(dir, "in");
  try {
    let total = 0;
    const file = createWriteStream(input);
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > DRIVE_MAX_FILE) {
        file.destroy();
        return NextResponse.json({ error: "Arquivo muito grande (máximo 100 MB)." }, { status: 413 });
      }
      if (!file.write(value)) await new Promise<void>((r) => file.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => file.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (!total) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });

    const key = `acc/${auth.accountId}/drive/${randomUUID()}-${safeFileName(name)}`;
    await putObject(key, await readFile(input), mime);
    const [row] = await db
      .insert(driveFiles)
      .values({ accountId: auth.accountId, folderId, name, mimeType: mime, size: total, kind: kindOf(mime), storageKey: key, createdBy: auth.user.name })
      .returning();
    const { storageKey, ...rest } = row;
    void storageKey;
    return NextResponse.json(rest, { status: 201 });
  } catch (e) {
    console.error("[drive] upload:", e);
    return NextResponse.json({ error: "Não foi possível salvar o arquivo agora. Tente de novo." }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
