import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { flows, flowBlocks, flowConnections, flowTriggers } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/flows
 * List all flows
 */
export async function GET(req: NextRequest) {
  try {
    const allFlows = await db.query.flows.findMany();
    return NextResponse.json(allFlows);
  } catch (error) {
    console.error("Error fetching flows:", error);
    return NextResponse.json(
      { error: "Failed to fetch flows" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/flows
 * Create a new flow
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, phoneNumber, priority = 0 } = body;

    if (!name || !phoneNumber) {
      return NextResponse.json(
        { error: "name and phoneNumber are required" },
        { status: 400 }
      );
    }

    const [newFlow] = await db
      .insert(flows)
      .values({
        name,
        description,
        phoneNumber,
        priority,
      })
      .returning();

    return NextResponse.json(newFlow, { status: 201 });
  } catch (error) {
    console.error("Error creating flow:", error);
    return NextResponse.json(
      { error: "Failed to create flow" },
      { status: 500 }
    );
  }
}
