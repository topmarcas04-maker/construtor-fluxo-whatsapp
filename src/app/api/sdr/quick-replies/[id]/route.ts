export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { quickReplies } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/sdr/quick-replies/[id]
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const [deleted] = await db
      .delete(quickReplies)
      .where(eq(quickReplies.id, id))
      .returning();
    if (!deleted) {
      return NextResponse.json({ error: "Quick reply not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Quick reply deleted" });
  } catch (error) {
    console.error("Error deleting quick reply:", error);
    return NextResponse.json({ error: "Failed to delete quick reply" }, { status: 500 });
  }
}
