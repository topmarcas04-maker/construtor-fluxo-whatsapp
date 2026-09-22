export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { leads, leadTags } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * PATCH /api/sdr/leads/[id]
 * Atualiza estágio (drag no funil), vendedor, valor, cidade, ou etiquetas.
 * Body: { stage?, sellerId?, dealValue?, city?, cardName?, addTagId?, removeTagId? }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const { addTagId, removeTagId, ...fields } = body;

    if (addTagId) {
      await db
        .insert(leadTags)
        .values({ leadId: id, tagId: addTagId })
        .onConflictDoNothing();
    }
    if (removeTagId) {
      await db
        .delete(leadTags)
        .where(and(eq(leadTags.leadId, id), eq(leadTags.tagId, removeTagId)));
    }

    if (Object.keys(fields).length > 0) {
      const [updated] = await db
        .update(leads)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(leads.id, id))
        .returning();
      if (!updated) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      return NextResponse.json(updated);
    }

    const current = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!current) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json(current);
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
