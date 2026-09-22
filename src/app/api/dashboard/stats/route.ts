import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { leads, flows, conversationStates, flowExecutions } from "@/db/schema";
import { eq, sum, count, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics: total sales, closed deals, average ticket, flow stats
 */
export async function GET(req: NextRequest) {
  try {
    // Total sales value
    const [totalSalesResult] = await db
      .select({
        total: sum(leads.dealValue).mapWith(Number),
      })
      .from(leads)
      .where(eq(leads.closed, true));

    const totalSales = totalSalesResult?.total || 0;

    // Closed deals count
    const closedDealsResult = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.closed, true));

    const closedDeals = closedDealsResult[0]?.count || 0;

    // Average ticket
    const averageTicket = closedDeals > 0 ? totalSales / closedDeals : 0;

    // Total leads
    const totalLeadsResult = await db
      .select({ count: count() })
      .from(leads);

    const totalLeads = totalLeadsResult[0]?.count || 0;

    // Active flows
    const activeFlowsResult = await db
      .select({ count: count() })
      .from(flows)
      .where(eq(flows.enabled, true));

    const activeFlows = activeFlowsResult[0]?.count || 0;

    // Active conversations
    const activeConversationsResult = await db
      .select({ count: count() })
      .from(conversationStates)
      .where(eq(conversationStates.status, "ACTIVE"));

    const activeConversations = activeConversationsResult[0]?.count || 0;

    // Total executions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const executionsTodayResult = await db
      .select({ count: count() })
      .from(flowExecutions)
      .where(
        sql`DATE(${flowExecutions.executedAt}) = ${today.toISOString().split("T")[0]}`
      );

    const executionsToday = executionsTodayResult[0]?.count || 0;

    // Leads by stage
    const leadsByStageResult = await db
      .select({
        stage: leads.stage,
        count: count().as("count"),
      })
      .from(leads)
      .groupBy(leads.stage);

    // Recent closed deals
    const recentClosedResult = await db
      .select({
        id: leads.id,
        cardName: leads.cardName,
        dealValue: leads.dealValue,
        closedAt: leads.closedAt,
      })
      .from(leads)
      .where(eq(leads.closed, true))
      .orderBy(leads.closedAt)
      .limit(5);

    return NextResponse.json({
      sales: {
        totalSales,
        closedDeals,
        averageTicket: parseFloat(averageTicket.toFixed(2)),
        totalLeads,
      },
      flows: {
        activeFlows,
        activeConversations,
        executionsToday,
      },
      leadsByStage: leadsByStageResult,
      recentDeals: recentClosedResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
