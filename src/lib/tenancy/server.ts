/**
 * Consultas de contas (multiempresa) usadas pelo site.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/db/schema";
import { ALL_MODULE_KEYS, modulesAllowedForType, type AccountType, type ModuleKey } from "@/lib/auth/modules";
import { resolveAiKey } from "./aiKey";

export type AccountRow = typeof accounts.$inferSelect;

export async function getAccount(id: string | null | undefined) {
  if (!id) return null;
  return (await db.query.accounts.findFirst({ where: eq(accounts.id, id) })) || null;
}

export async function getMasterAccount() {
  return (await db.query.accounts.findFirst({ where: eq(accounts.type, "MASTER") })) || null;
}

/** Ids da conta e de todas as contas abaixo dela (parceiros, clientes dos parceiros...) */
export async function getSubtreeIds(rootId: string): Promise<string[]> {
  const res = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM accounts WHERE id = ${rootId}
      UNION ALL
      SELECT a.id FROM accounts a JOIN tree t ON a.parent_id = t.id
    )
    SELECT id FROM tree
  `);
  return (res.rows as { id: string }[]).map((r) => r.id);
}

/** A conta "id" está dentro da árvore de "ancestorId" (ou é a própria)? */
export async function isInSubtree(ancestorId: string, id: string) {
  if (ancestorId === id) return true;
  let current = await getAccount(id);
  for (let i = 0; current && i < 8; i++) {
    if (current.parentId === ancestorId) return true;
    current = await getAccount(current.parentId);
  }
  return false;
}

/**
 * Menus que a conta realmente tem: o Master tem todos; as outras têm o que a conta
 * mãe liberou E que a conta mãe ainda tem (se o Master tirar um menu do parceiro,
 * os clientes do parceiro também perdem).
 */
export async function getAccountModules(account: AccountRow | null): Promise<ModuleKey[]> {
  if (!account) return [];
  if (account.type === "MASTER") return ALL_MODULE_KEYS;
  let allowed = new Set<string>(
    (account.modules || []).filter((m) => modulesAllowedForType(account.type as AccountType).includes(m as ModuleKey))
  );
  let parent = await getAccount(account.parentId);
  for (let i = 0; parent && i < 8; i++) {
    if (parent.type === "MASTER") break;
    const pm = new Set(parent.modules || []);
    allowed = new Set([...allowed].filter((m) => pm.has(m)));
    parent = await getAccount(parent.parentId);
  }
  return ALL_MODULE_KEYS.filter((k) => allowed.has(k));
}

export async function resolveAccountAiKey(accountId: string) {
  return resolveAiKey(accountId, (id) => getAccount(id));
}

/** Gera um identificador curto e único para o link de login */
export async function uniqueSlug(name: string) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "conta";
  let slug = base;
  for (let i = 2; i < 500; i++) {
    const exists = await db.query.accounts.findFirst({ where: eq(accounts.slug, slug) });
    if (!exists) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
