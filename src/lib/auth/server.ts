/**
 * Helpers de autenticação para rotas de API e componentes de servidor.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { SESSION_COOKIE, readSessionToken } from "./session";
import { hasModule, type ModuleKey } from "./modules";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  sellerId: string | null;
  partnerId: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const uid = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  try {
    const user = await db.query.appUsers.findFirst({ where: eq(appUsers.id, uid) });
    if (!user || !user.active) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: (user.permissions as string[]) || [],
      sellerId: user.sellerId,
      partnerId: user.partnerId,
    };
  } catch {
    return null;
  }
}

/**
 * Garante usuário logado (e com o módulo liberado, se informado).
 * Retorna o usuário ou uma resposta 401/403 pronta para devolver.
 */
export async function requireUser(
  module?: ModuleKey | ModuleKey[]
): Promise<{ user: CurrentUser; error?: never } | { user?: never; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Faça login novamente" }, { status: 401 }) };
  }
  if (module) {
    const list = Array.isArray(module) ? module : [module];
    if (!list.some((m) => hasModule(user, m))) {
      return { error: NextResponse.json({ error: "Sem permissão para este módulo" }, { status: 403 }) };
    }
  }
  return { user };
}
