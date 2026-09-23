import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { metaConnections, metaPending } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/tenancy/secret";
import type { MetaPage } from "./graph";

/** Páginas encontradas no último login do Facebook da conta (válidas por 1 hora) */
export async function getPendingPages(accountId: string): Promise<MetaPage[]> {
  await db.delete(metaPending).where(lt(metaPending.createdAt, new Date(Date.now() - 60 * 60_000)));
  const row = await db.query.metaPending.findFirst({
    where: eq(metaPending.accountId, accountId),
    orderBy: [desc(metaPending.createdAt)],
  });
  const json = decryptSecret(row?.payloadEnc);
  if (!json) return [];
  try {
    return JSON.parse(json) as MetaPage[];
  } catch {
    return [];
  }
}

export async function savePendingPages(accountId: string, pages: MetaPage[]) {
  await db.delete(metaPending).where(eq(metaPending.accountId, accountId));
  await db.insert(metaPending).values({ accountId, payloadEnc: encryptSecret(JSON.stringify(pages)) });
}

export async function clearPending(accountId: string) {
  await db.delete(metaPending).where(eq(metaPending.accountId, accountId));
}

export async function listConnections(accountId: string) {
  const rows = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.accountId, accountId))
    .orderBy(metaConnections.createdAt);
  return rows.map(({ pageTokenEnc: _t, ...r }) => {
    void _t;
    return r;
  });
}

export async function ownConnection(accountId: string, id: string) {
  return db.query.metaConnections.findFirst({
    where: and(eq(metaConnections.id, id), eq(metaConnections.accountId, accountId)),
  });
}

export function connectionToken(row: { pageTokenEnc: string }) {
  return decryptSecret(row.pageTokenEnc);
}
