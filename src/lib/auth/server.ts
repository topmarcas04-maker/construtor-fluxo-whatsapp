/**
 * Autenticação + conta ativa (multiempresa).
 *
 * Cada usuário pertence a uma conta (Master, Parceiro ou Cliente). Administradores
 * podem "visualizar como" uma conta abaixo deles (ex.: o Master entra no painel de um
 * cliente para configurar o WhatsApp). A conta ativa vem do cookie ACTING_COOKIE e é
 * sempre validada: só vale se estiver dentro da árvore da conta do usuário.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { SESSION_COOKIE, readSessionToken } from "./session";
import { type ModuleKey } from "./modules";
import { getAccount, getAccountModules, isInSubtree } from "@/lib/tenancy/server";

export const ACTING_COOKIE = "sdr_acting";

export interface CurrentAccount {
  id: string;
  name: string;
  type: "MASTER" | "PARTNER" | "CLIENT";
  parentId: string | null;
  slug: string;
  /** Situação do WhatsApp gravada pelo motor */
  waState: string | null;
  waEnabled: boolean;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  sellerId: string | null;
  /** Conta do próprio usuário */
  homeAccount: CurrentAccount;
  /** Conta que está sendo visualizada agora (igual à homeAccount, ou uma conta abaixo) */
  account: CurrentAccount;
  /** true quando está visualizando outra conta */
  actingAs: boolean;
  /** Menus efetivos nesta conta */
  modules: string[];
  /** Pode visualizar contas abaixo (administrador) */
  canManage: boolean;
  /** Pode editar os cards dos leads (estágio, vendedor, valor, etiquetas, dados) */
  canEditLeads: boolean;
}

/** Permissão extra (não é menu) que o administrador dá a um vendedor */
export const EDIT_LEADS_PERMISSION = "editar-leads";

function toAccount(a: NonNullable<Awaited<ReturnType<typeof getAccount>>>): CurrentAccount {
  return {
    id: a.id,
    name: a.name,
    type: a.type as CurrentAccount["type"],
    parentId: a.parentId,
    slug: a.slug,
    waState: a.waState,
    waEnabled: a.waEnabled,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const uid = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  try {
    const user = await db.query.appUsers.findFirst({ where: eq(appUsers.id, uid) });
    if (!user || !user.active || !user.accountId) return null;
    const home = await getAccount(user.accountId);
    if (!home || !home.active) return null;

    const isAdmin = user.role === "MASTER" || user.role === "ADMIN";
    let acting = home;
    const actingId = store.get(ACTING_COOKIE)?.value;
    if (isAdmin && actingId && actingId !== home.id) {
      const target = await getAccount(actingId);
      if (target && (await isInSubtree(home.id, target.id))) acting = target;
    }
    const actingAs = acting.id !== home.id;

    const accountModules = await getAccountModules(acting);
    const perms = (user.permissions as string[]) || [];
    const modules = isAdmin || actingAs ? accountModules : accountModules.filter((m) => perms.includes(m));

    // Editar cards: Master/Parceiro sempre; Cliente só se quem cadastrou liberou (ou se é o parceiro/master acessando).
    // Dentro da conta: administradores, ou vendedores com a permissão "editar-leads".
    const accountAllows = acting.type !== "CLIENT" || acting.leadEdit || actingAs;
    const userAllows = isAdmin || actingAs || perms.includes(EDIT_LEADS_PERMISSION);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: perms,
      sellerId: actingAs ? null : user.sellerId,
      homeAccount: toAccount(home),
      account: toAccount(acting),
      actingAs,
      modules,
      canManage: isAdmin,
      canEditLeads: accountAllows && userAllows,
    };
  } catch (err) {
    console.error("[auth] getCurrentUser:", err);
    return null;
  }
}

/**
 * Garante usuário logado (e com o menu liberado, se informado).
 * Devolve o usuário e o id da conta ativa, que TODA consulta deve usar para filtrar.
 */
export async function requireUser(
  module?: ModuleKey | ModuleKey[]
): Promise<
  { user: CurrentUser; accountId: string; error?: never } | { user?: never; accountId?: never; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Faça login novamente" }, { status: 401 }) };
  }
  if (module) {
    const list = Array.isArray(module) ? module : [module];
    if (!list.some((m) => user.modules.includes(m))) {
      return { error: NextResponse.json({ error: "Sem permissão para este menu" }, { status: 403 }) };
    }
  }
  return { user, accountId: user.account.id };
}

/** Vendedor com vínculo vê só os próprios leads/agendamentos */
export function sellerScope(user: CurrentUser) {
  return user.role === "SELLER" && user.sellerId ? user.sellerId : null;
}
