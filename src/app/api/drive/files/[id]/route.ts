export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, driveFolders } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { deleteObject, signedUrl, storageReady } from "@/lib/storage/s3";

async function own(accountId: string, id: string) {
  return db.query.driveFiles.findFirst({ where: and(eq(driveFiles.id, id), eq(driveFiles.accountId, accountId)) });
}

/** Abre/baixa o arquivo (link temporário do bucket). ?download=1 força o download */
export async function GET(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["drive", "leads", "disparos"]);
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const f = await own(auth.accountId, id);
  if (!f || !storageReady()) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  return NextResponse.redirect(await signedUrl(f.storageKey, 3600), 302);
}

/** Renomear ou mover para outra pasta */
export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  if (!(await own(auth.accountId, id))) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const body = await req.json();
  const set: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: "Dê um nome ao arquivo" }, { status: 400 });
    set.name = name;
  }
  if (body.folderId !== undefined) {
    const folderId = body.folderId ? String(body.folderId) : null;
    if (folderId && !(await db.query.driveFolders.findFirst({ where: and(eq(driveFolders.id, folderId), eq(driveFolders.accountId, auth.accountId)) }))) {
      return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
    }
    set.folderId = folderId;
  }
  const [row] = await db.update(driveFiles).set(set).where(eq(driveFiles.id, id)).returning();
  const { storageKey, ...rest } = row;
  void storageKey;
  return NextResponse.json(rest);
}

export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const f = await own(auth.accountId, id);
  if (!f) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  if (storageReady()) await deleteObject(f.storageKey);
  await db.delete(driveFiles).where(eq(driveFiles.id, id));
  return NextResponse.json({ ok: true });
}
