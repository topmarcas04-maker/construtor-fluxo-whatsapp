import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { flowBlocks } from "@/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  params: {
    id: string;
  };
}

/**
 * POST /api/flows/[id]/blocks
 * Create a new block in a flow
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = params;
    const body = await req.json();
    const { type, config, positionX, positionY } = body;

    if (!type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 }
      );
    }

    const [newBlock] = await db
      .insert(flowBlocks)
      .values({
        flowId: id,
        type,
        config: config || {},
        positionX: positionX || 0,
        positionY: positionY || 0,
      })
      .returning();

    return NextResponse.json(newBlock, { status: 201 });
  } catch (error) {
    console.error("Error creating block:", error);
    return NextResponse.json(
      { error: "Failed to create block" },
      { status: 500 }
    );
  }
}
