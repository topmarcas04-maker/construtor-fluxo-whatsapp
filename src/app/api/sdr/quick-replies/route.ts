export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { quickReplies } from "@/db/schema";

/**
 * GET /api/sdr/quick-replies — lista respostas rápidas
 * POST /api/sdr/quick-replies — cria resposta rápida
 */
export async function GET() {
  try {
    const all = await db.query.quickReplies.findMany({
      orderBy: (q, { asc }) => asc(q.shortcut),
    });
    return NextResponse.json(all);
  } catch (error) {
    console.error("Error fetching quick replies:", error);
    return NextResponse.json({ error: "Failed to fetch quick replies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shortcut, message } = body;
    if (!shortcut || !message) {
      return NextResponse.json(
        { error: "shortcut e message são obrigatórios" },
        { status: 400 }
      );
    }
    const cleanShortcut = shortcut.replace(/^\/+/, "");
    const [created] = await db
      .insert(quickReplies)
      .values({ shortcut: cleanShortcut, message })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating quick reply:", error);
    return NextResponse.json({ error: "Failed to create quick reply" }, { status: 500 });
  }
}
