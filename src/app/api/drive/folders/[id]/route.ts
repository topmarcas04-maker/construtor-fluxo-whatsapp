export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, driveFolders } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { deleteObject, storageReady } from "@/lib/storage/s3";

export async function PATCH(req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const name = String((await req.json()).name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Dê um nome à pasta" }, { status: 400 });
  const [row] = await db
    .update(driveFolders)
    .set({ name })
    .where(and(eq(driveFolders.id, id), eq(driveFolders.accountId, auth.accountId)))
    .returning();
  if (!row) return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
  return NextResponse.json(row);
}

/** Apaga a pasta, as subpastas e todos os arquivos dentro delas */
export async function DELETE(_req: NextRequest, c: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  const { id } = await c.params;
  const all = await db.select().from(driveFolders).where(eq(driveFolders.accountId, auth.accountId));
  if (!all.some((f) => f.id === id)) return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const f of all) if (f.parentId === ids[i] && !ids.includes(f.id)) ids.push(f.id);
  const files = await db.select().from(driveFiles).where(and(eq(driveFiles.accountId, auth.accountId), inArray(driveFiles.folderId, ids)));
  if (storageReady()) for (const f of files) await deleteObject(f.storageKey);
  await db.delete(driveFiles).where(and(eq(driveFiles.accountId, auth.accountId), inArray(driveFiles.folderId, ids)));
  await db.delete(driveFolders).where(and(eq(driveFolders.accountId, auth.accountId), inArray(driveFolders.id, ids)));
  return NextResponse.json({ ok: true, files: files.length });
}
