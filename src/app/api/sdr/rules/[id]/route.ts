export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { distributionRules } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/sdr/rules/[id]
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const [deleted] = await db
      .delete(distributionRules)
      .where(eq(distributionRules.id, id))
      .returning();
    if (!deleted) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Rule deleted" });
  } catch (error) {
    console.error("Error deleting rule:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
