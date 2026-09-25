export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, driveFolders } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { storageReady } from "@/lib/storage/s3";

/** Pastas e arquivos da conta (também usado para escolher arquivo na conversa) */
export async function GET() {
  const auth = await requireUser(["drive", "leads", "disparos"]);
  if (auth.error) return auth.error;
  const [folders, files] = await Promise.all([
    db.select().from(driveFolders).where(eq(driveFolders.accountId, auth.accountId)).orderBy(asc(driveFolders.name)),
    db.select().from(driveFiles).where(eq(driveFiles.accountId, auth.accountId)).orderBy(desc(driveFiles.createdAt)),
  ]);
  return NextResponse.json({
    folders,
    files: files.map(({ storageKey, ...f }) => (void storageKey, f)),
    storageReady: storageReady(),
    canEdit: auth.user.modules.includes("drive"),
  });
}
