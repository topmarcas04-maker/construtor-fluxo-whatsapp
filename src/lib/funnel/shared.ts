/**
 * Funis e colunas — lógica comum ao site e ao motor (sem imports "@/").
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { DEFAULT_COLUMNS, NEW_FUNNEL_COLUMNS, type Funnel, type FunnelColumn, type FunnelWithColumns } from "./common";

export * from "./common";

type Db = NodePgDatabase<typeof schema>;

const funnelFields = {
  id: schema.funnels.id,
  name: schema.funnels.name,
  isDefault: schema.funnels.isDefault,
  sort: schema.funnels.sort,
};

const columnFields = {
  id: schema.funnelColumns.id,
  funnelId: schema.funnelColumns.funnelId,
  name: schema.funnelColumns.name,
  kind: schema.funnelColumns.kind,
  aiRule: schema.funnelColumns.aiRule,
  color: schema.funnelColumns.color,
  sort: schema.funnelColumns.sort,
};

/** Funis da conta; cria o "Funil principal" na primeira vez e coloca nele as colunas antigas */
export async function ensureFunnels(db: Db, accountId: string): Promise<Funnel[]> {
  const load = () =>
    db
      .select(funnelFields)
      .from(schema.funnels)
      .where(eq(schema.funnels.accountId, accountId))
      .orderBy(asc(schema.funnels.sort), asc(schema.funnels.createdAt));
  let rows = await load();
  if (rows.some((f) => f.isDefault)) return rows;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"funnels:" + accountId}))`);
    const again = await tx
      .select({ id: schema.funnels.id })
      .from(schema.funnels)
      .where(and(eq(schema.funnels.accountId, accountId), eq(schema.funnels.isDefault, true)))
      .limit(1);
    if (again.length) return;
    const [def] = await tx
      .insert(schema.funnels)
      .values({ accountId, name: "Funil principal", isDefault: true, sort: 0 })
      .returning({ id: schema.funnels.id });
    await tx
      .update(schema.funnelColumns)
      .set({ funnelId: def.id })
      .where(and(eq(schema.funnelColumns.accountId, accountId), isNull(schema.funnelColumns.funnelId)));
  });
  rows = await load();
  return rows;
}

export async function defaultFunnelId(db: Db, accountId: string) {
  const list = await ensureFunnels(db, accountId);
  return (list.find((f) => f.isDefault) || list[0]).id;
}

/** Colunas de um funil (o padrão, se não informado), criando as colunas iniciais na primeira vez */
export async function ensureColumns(db: Db, accountId: string, funnelId?: string | null): Promise<FunnelColumn[]> {
  const list = await ensureFunnels(db, accountId);
  const funnel = list.find((f) => f.id === funnelId) || list.find((f) => f.isDefault) || list[0];
  const load = () =>
    db
      .select(columnFields)
      .from(schema.funnelColumns)
      .where(and(eq(schema.funnelColumns.accountId, accountId), eq(schema.funnelColumns.funnelId, funnel.id)))
      .orderBy(asc(schema.funnelColumns.sort), asc(schema.funnelColumns.createdAt));
  let rows = await load();
  if (rows.length) return rows;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"funnel:" + funnel.id}))`);
    const again = await tx
      .select({ id: schema.funnelColumns.id })
      .from(schema.funnelColumns)
      .where(eq(schema.funnelColumns.funnelId, funnel.id))
      .limit(1);
    if (again.length) return;
    const initial = funnel.isDefault ? DEFAULT_COLUMNS : NEW_FUNNEL_COLUMNS;
    await tx.insert(schema.funnelColumns).values(
      initial.map((c, i) => ({
        accountId,
        funnelId: funnel.id,
        name: c.name,
        kind: c.kind,
        aiRule: "aiRule" in c ? (c as { aiRule?: string }).aiRule || null : null,
        color: "color" in c ? (c as { color?: string }).color || null : null,
        sort: i,
      }))
    );
  });
  rows = await load();
  return rows;
}

/** Todos os funis com as colunas de cada um */
export async function funnelsWithColumns(db: Db, accountId: string): Promise<FunnelWithColumns[]> {
  const list = await ensureFunnels(db, accountId);
  return Promise.all(list.map(async (f) => ({ ...f, columns: await ensureColumns(db, accountId, f.id) })));
}
