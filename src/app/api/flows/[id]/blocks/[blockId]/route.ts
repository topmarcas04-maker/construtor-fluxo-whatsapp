export const dynamic = "force-dynamic";
import { db } from "@/db/client";
import { flowBlocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; blockId: string }> }
) {
  const params = await ctx.params;
  try {
    const { positionX, positionY, config } = await request.json();

    const updates: any = {};
    if (positionX !== undefined) updates.positionX = positionX;
    if (positionY !== undefined) updates.positionY = positionY;
    if (config !== undefined) updates.config = config;

    const block = await db
      .update(flowBlocks)
      .set(updates)
      .where(eq(flowBlocks.id, params.blockId))
      .returning();

    return NextResponse.json(block[0]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; blockId: string }> }
) {
  const params = await ctx.params;
  try {
    await db.delete(flowBlocks).where(eq(flowBlocks.id, params.blockId));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
