/**
 * Colunas do funil — lógica comum ao site e ao motor (sem imports "@/").
 */
import { asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { DEFAULT_COLUMNS, type FunnelColumn } from "./common";

export * from "./common";

type Db = NodePgDatabase<typeof schema>;

/** Lista as colunas da conta, criando as padrão na primeira vez */
export async function ensureColumns(db: Db, accountId: string): Promise<FunnelColumn[]> {
  const load = () =>
    db
      .select({
        id: schema.funnelColumns.id,
        name: schema.funnelColumns.name,
        kind: schema.funnelColumns.kind,
        aiRule: schema.funnelColumns.aiRule,
        color: schema.funnelColumns.color,
        sort: schema.funnelColumns.sort,
      })
      .from(schema.funnelColumns)
      .where(eq(schema.funnelColumns.accountId, accountId))
      .orderBy(asc(schema.funnelColumns.sort), asc(schema.funnelColumns.createdAt));
  let rows = await load();
  if (rows.length) return rows;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"funnel:" + accountId}))`);
    const again = await tx
      .select({ id: schema.funnelColumns.id })
      .from(schema.funnelColumns)
      .where(eq(schema.funnelColumns.accountId, accountId))
      .limit(1);
    if (again.length) return;
    await tx.insert(schema.funnelColumns).values(
      DEFAULT_COLUMNS.map((c, i) => ({
        accountId,
        name: c.name,
        kind: c.kind,
        aiRule: c.aiRule || null,
        color: c.color || null,
        sort: i,
      }))
    );
  });
  rows = await load();
  return rows;
}
