export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { leads, leadTags, conversations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";

const STAGES = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"];
const SALE_TYPES = ["ANY", "WHOLESALE", "RETAIL"];

/**
 * PATCH /api/sdr/leads/[id]
 * Body (tudo opcional): stage, sellerId, dealValue, city, cardName, note, aiPaused,
 * saleType, interest, addTagId, removeTagId
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    if (auth.user.role === "SELLER" && auth.user.sellerId && lead.sellerId !== auth.user.sellerId) {
      return NextResponse.json({ error: "Este lead é de outro vendedor" }, { status: 403 });
    }

    if (body.addTagId) {
      await db.insert(leadTags).values({ leadId: id, tagId: body.addTagId }).onConflictDoNothing();
    }
    if (body.removeTagId) {
      await db.delete(leadTags).where(and(eq(leadTags.leadId, id), eq(leadTags.tagId, body.removeTagId)));
    }

    const set: Record<string, unknown> = {};
    if (body.stage !== undefined && STAGES.includes(body.stage)) {
      set.stage = body.stage;
      set.closed = body.stage === "SALE";
      set.closedAt = body.stage === "SALE" ? new Date() : null;
    }
    if (body.sellerId !== undefined) set.sellerId = body.sellerId || null;
    if (body.dealValue !== undefined) {
      const v = body.dealValue === null || body.dealValue === "" ? null : Number(body.dealValue);
      set.dealValue = v === null || Number.isNaN(v) ? null : v;
    }
    if (body.city !== undefined) set.city = String(body.city || "").trim() || null;
    if (body.note !== undefined) set.note = String(body.note || "") || null;
    if (body.interest !== undefined) set.interest = String(body.interest || "").slice(0, 255) || null;
    if (body.aiPaused !== undefined) set.aiPaused = Boolean(body.aiPaused);
    if (body.saleType !== undefined && SALE_TYPES.includes(body.saleType)) set.saleType = body.saleType;
    if (body.cardName !== undefined) {
      const name = String(body.cardName || "").trim() || null;
      set.cardName = name;
      await db.update(conversations).set({ leadName: name }).where(eq(conversations.id, lead.conversationId));
    }

    if (Object.keys(set).length > 0 || body.addTagId || body.removeTagId) {
      set.updatedAt = new Date();
      await db.update(leads).set(set).where(eq(leads.id, id));
    }
    const current = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    return NextResponse.json(current);
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json({ error: "Falha ao atualizar o lead" }, { status: 500 });
  }
}
