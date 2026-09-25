export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFolders } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  const auth = await requireUser("drive");
  if (auth.error) return auth.error;
  const body = await req.json();
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Dê um nome à pasta" }, { status: 400 });
  let parentId: string | null = body.parentId ? String(body.parentId) : null;
  if (parentId) {
    const parent = await db.query.driveFolders.findFirst({ where: and(eq(driveFolders.id, parentId), eq(driveFolders.accountId, auth.accountId)) });
    if (!parent) parentId = null;
  }
  const [created] = await db.insert(driveFolders).values({ accountId: auth.accountId, name, parentId }).returning();
  return NextResponse.json(created, { status: 201 });
}
