export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { sellers } from "@/db/schema";

/**
 * GET /api/sdr/sellers — lista vendedores
 * POST /api/sdr/sellers — cria vendedor
 */
export async function GET() {
  try {
    const all = await db.query.sellers.findMany({
      orderBy: (s, { asc }) => asc(s.name),
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching sellers:", error);
    return NextResponse.json({ error: "Failed to fetch sellers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone } = body;
    if (!name) {
      return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
    }
    const [created] = await db.insert(sellers).values({ name, phone }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating seller:", error);
    return NextResponse.json({ error: "Failed to create seller" }, { status: 500 });
  }
}
