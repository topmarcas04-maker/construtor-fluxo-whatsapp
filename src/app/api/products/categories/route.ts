export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { productCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  const auth = await requireUser("produtos");
  if (auth.error) return auth.error;
  const { name } = await req.json();
  const n = String(name || "").trim();
  if (!n) return NextResponse.json({ error: "Informe o nome da categoria" }, { status: 400 });
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${productCategories.sort}), 0)::int` })
    .from(productCategories)
    .where(eq(productCategories.accountId, auth.accountId));
  const [created] = await db
    .insert(productCategories)
    .values({ accountId: auth.accountId, name: n.slice(0, 120), sort: max + 1 })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
