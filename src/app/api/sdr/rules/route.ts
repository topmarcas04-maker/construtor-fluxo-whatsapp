export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { distributionRules, sellers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireUser(["leads", "configuracoes"]);
  if (auth.error) return auth.error;
  const all = await db.query.distributionRules.findMany({
    where: eq(distributionRules.accountId, auth.accountId),
    with: { seller: true },
    orderBy: (r, { desc }) => desc(r.priority),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { region, saleType, sellerId, priority } = await req.json();
  const seller = sellerId
    ? await db.query.sellers.findFirst({ where: and(eq(sellers.id, sellerId), eq(sellers.accountId, auth.accountId)) })
    : null;
  if (!seller) return NextResponse.json({ error: "Escolha o vendedor" }, { status: 400 });
  const [created] = await db
    .insert(distributionRules)
    .values({
      accountId: auth.accountId,
      region: region ? String(region).trim() : null,
      saleType: ["ANY", "WHOLESALE", "RETAIL"].includes(saleType) ? saleType : "ANY",
      sellerId: seller.id,
      priority: Number(priority) || 0,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
