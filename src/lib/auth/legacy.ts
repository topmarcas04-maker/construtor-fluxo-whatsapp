import { NextResponse } from "next/server";
import { getCurrentUser } from "./server";

/** Construtor de fluxos antigo (legado): só o administrador da conta Master acessa */
export async function legacyGuard() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login novamente" }, { status: 401 });
  if (user.homeAccount.type !== "MASTER" || user.actingAs || !user.canManage) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  return null;
}
