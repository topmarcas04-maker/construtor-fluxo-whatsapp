export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { tags } from "@/db/schema";

/**
 * GET /api/sdr/tags — lista etiquetas
 * POST /api/sdr/tags — cria etiqueta
 */
export async function GET() {
  const auth = await requireUser(["leads", "configuracoes"]);
  if (auth.error) return auth.error;
  try {
    const all = await db.query.tags.findMany({
      orderBy: (t, { asc }) => asc(t.createdAt),
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const { name, color } = body;
    if (!name) {
      return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
    }
    const [created] = await db
      .insert(tags)
      .values({ name, color: color || "blue" })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
