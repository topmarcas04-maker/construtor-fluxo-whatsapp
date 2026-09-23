/**
 * Ações da IA — lógica comum ao site e ao motor (sem imports "@/").
 */
import { asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { DEFAULT_ACTIONS, type AiAction } from "./common";
import { ensureColumns } from "../funnel/shared";

export * from "./common";

type Db = NodePgDatabase<typeof schema>;

/** Lista as ações da conta, criando as padrão na primeira vez */
export async function ensureActions(db: Db, accountId: string): Promise<AiAction[]> {
  const load = () =>
    db
      .select({
        id: schema.aiActions.id,
        name: schema.aiActions.name,
        kind: schema.aiActions.kind,
        instructions: schema.aiActions.instructions,
        appointmentTitle: schema.aiActions.appointmentTitle,
        appointmentMinutes: schema.aiActions.appointmentMinutes,
        columnId: schema.aiActions.columnId,
        handoff: schema.aiActions.handoff,
        active: schema.aiActions.active,
        sort: schema.aiActions.sort,
      })
      .from(schema.aiActions)
      .where(eq(schema.aiActions.accountId, accountId))
      .orderBy(asc(schema.aiActions.sort), asc(schema.aiActions.createdAt));
  let rows = await load();
  if (rows.length) return rows;
  const columns = await ensureColumns(db, accountId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"actions:" + accountId}))`);
    const again = await tx
      .select({ id: schema.aiActions.id })
      .from(schema.aiActions)
      .where(eq(schema.aiActions.accountId, accountId))
      .limit(1);
    if (again.length) return;
    await tx.insert(schema.aiActions).values(
      DEFAULT_ACTIONS.map((a, i) => ({
        accountId,
        name: a.name,
        kind: a.kind,
        instructions: a.instructions,
        appointmentTitle: a.appointmentTitle || null,
        appointmentMinutes: a.appointmentMinutes || null,
        handoff: Boolean(a.handoff),
        columnId: a.columnName ? columns.find((c) => c.name.toLowerCase() === a.columnName!.toLowerCase())?.id || null : null,
        sort: i,
      }))
    );
  });
  rows = await load();
  return rows;
}
