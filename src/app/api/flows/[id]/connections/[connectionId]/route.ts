export const dynamic = "force-dynamic";
import { db } from "@/db/client";
import { flowConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { legacyGuard } from "@/lib/auth/legacy";

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; connectionId: string }> }
) {
  const denied = await legacyGuard();
  if (denied) return denied;
  const params = await ctx.params;
  try {
    await db.delete(flowConnections).where(eq(flowConnections.id, params.connectionId));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; connectionId: string }> }
) {
  const denied = await legacyGuard();
  if (denied) return denied;
  const params = await ctx.params;
  try {
    const { label, conditionKey, conditionValue } = await request.json();

    const updates: any = {};
    if (label !== undefined) updates.label = label;
    if (conditionKey !== undefined) updates.conditionKey = conditionKey;
    if (conditionValue !== undefined) updates.conditionValue = conditionValue;

    const connection = await db
      .update(flowConnections)
      .set(updates)
      .where(eq(flowConnections.id, params.connectionId))
      .returning();

    return NextResponse.json(connection[0]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
  }
}
