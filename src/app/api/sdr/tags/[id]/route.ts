export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/sdr/tags/[id]
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const [deleted] = await db.delete(tags).where(eq(tags.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Tag deleted" });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
