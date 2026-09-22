export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { flows, flowBlocks, flowConnections, flowTriggers } from "@/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  params: {
    id: string;
  };
}

/**
 * GET /api/flows/[id]
 * Get a specific flow with all its blocks, connections, and triggers
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; }> }) {
  const params = await ctx.params;
  try {
    const { id } = params;

    const flow = await db.query.flows.findFirst({
      where: eq(flows.id, id),
      with: {
        blocks: true,
        connections: true,
        triggers: true,
      },
    });

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json(flow);
  } catch (error) {
    console.error("Error fetching flow:", error);
    return NextResponse.json(
      { error: "Failed to fetch flow" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/flows/[id]
 * Update a flow
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; }> }) {
  const params = await ctx.params;
  try {
    const { id } = params;
    const body = await req.json();

    const [updated] = await db
      .update(flows)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(flows.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating flow:", error);
    return NextResponse.json(
      { error: "Failed to update flow" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/flows/[id]
 * Delete a flow (cascades to blocks, connections, triggers)
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; }> }) {
  const params = await ctx.params;
  try {
    const { id } = params;

    const [deleted] = await db
      .delete(flows)
      .where(eq(flows.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Flow deleted", flow: deleted });
  } catch (error) {
    console.error("Error deleting flow:", error);
    return NextResponse.json(
      { error: "Failed to delete flow" },
      { status: 500 }
    );
  }
}
