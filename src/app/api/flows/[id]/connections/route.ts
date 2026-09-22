export const dynamic = "force-dynamic";
import { db } from "@/db/client";
import { flowConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { legacyGuard } from "@/lib/auth/legacy";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await legacyGuard();
  if (denied) return denied;
  const params = await ctx.params;
  try {
    const { fromBlockId, toBlockId, label, conditionKey, conditionValue } =
      await request.json();

    if (!fromBlockId || !toBlockId) {
      return NextResponse.json(
        { error: "Missing fromBlockId or toBlockId" },
        { status: 400 }
      );
    }

    const connection = await db
      .insert(flowConnections)
      .values({
        flowId: params.id,
        fromBlockId,
        toBlockId,
        label: label || null,
        conditionKey: conditionKey || null,
        conditionValue: conditionValue || null,
      })
      .returning();

    return NextResponse.json(connection[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create connection" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await legacyGuard();
  if (denied) return denied;
  const params = await ctx.params;
  try {
    const connections = await db
      .select()
      .from(flowConnections)
      .where(eq(flowConnections.flowId, params.id));

    return NextResponse.json(connections);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}
