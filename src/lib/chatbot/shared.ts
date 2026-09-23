/**
 * Chatbot — consultas usadas pelo site e pelo motor (sem imports "@/").
 */
import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import type { Chatbot } from "./common";

export * from "./common";

type Db = NodePgDatabase<typeof schema>;

export async function listChatbots(db: Db, accountId: string): Promise<Chatbot[]> {
  const rows = await db
    .select()
    .from(schema.chatbots)
    .where(eq(schema.chatbots.accountId, accountId))
    .orderBy(asc(schema.chatbots.sort), asc(schema.chatbots.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    trigger: r.trigger as Chatbot["trigger"],
    keywords: r.keywords || [],
    tagIds: r.tagIds || [],
    skipTagIds: r.skipTagIds || [],
    channels: r.channels || [],
    restartHours: r.restartHours,
    steps: (r.steps || []) as Chatbot["steps"],
    fallbackMessage: r.fallbackMessage,
    maxTries: r.maxTries,
    afterFail: r.afterFail as Chatbot["afterFail"],
    sort: r.sort,
  }));
}

type AccountLike = { id: string; type: string; parentId: string | null; modules: string[] | null; active?: boolean };

/**
 * A conta tem o menu liberado? Mesma regra da tela: o Master tem tudo; as outras
 * precisam ter o menu E a conta mãe também (se o Master tirar do parceiro, os clientes perdem).
 */
export async function accountHasModule(
  accountId: string,
  key: string,
  loadAccount: (id: string) => Promise<AccountLike | null | undefined>
) {
  let acc = await loadAccount(accountId);
  if (!acc) return false;
  if (acc.type === "MASTER") return true;
  if (!(acc.modules || []).includes(key)) return false;
  for (let i = 0; i < 8 && acc?.parentId; i++) {
    acc = await loadAccount(acc.parentId);
    if (!acc || acc.type === "MASTER") return true;
    if (!(acc.modules || []).includes(key)) return false;
  }
  return true;
}
