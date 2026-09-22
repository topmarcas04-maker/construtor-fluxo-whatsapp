export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { distributionRules } from "@/db/schema";

/**
 * GET /api/sdr/rules — lista regras de distribuição (com o vendedor)
 * POST /api/sdr/rules — cria regra
 */
export async function GET() {
  try {
    const all = await db.query.distributionRules.findMany({
      with: { seller: true },
      orderBy: (r, { asc }) => asc(r.priority),
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching rules:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { region, saleType, sellerId, priority } = body;
    if (!sellerId) {
      return NextResponse.json({ error: "sellerId é obrigatório" }, { status: 400 });
    }
    const [created] = await db
      .insert(distributionRules)
      .values({
        region: region || null,
        saleType: saleType || "ANY",
        sellerId,
        priority: priority ?? 0,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating rule:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
