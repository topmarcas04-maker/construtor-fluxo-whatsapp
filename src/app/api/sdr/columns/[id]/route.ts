export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funnelColumns } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureColumns } from "@/lib/funnel/shared";
import { columnValues, canManageColumns } from "@/lib/funnel/validate";

async function own(accountId: string, id: string) {
  return db.query.funnelColumns.findFirst({ where: and(eq(funnelColumns.id, id), eq(funnelColumns.accountId, accountId)) });
}

/** PATCH — renomear / mudar regra da IA / cor */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canManageColumns(auth.user)) {
    return NextResponse.json({ error: "Só o administrador pode mudar as colunas do funil." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const col = await own(auth.accountId, id);
  if (!col) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
  const parsed = columnValues(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // A coluna "Vendas" não recebe leads pela IA
  if (col.kind === "SALE") delete parsed.values.aiRule;
  if (Object.keys(parsed.values).length) await db.update(funnelColumns).set(parsed.values).where(eq(funnelColumns.id, id));
  return NextResponse.json(await ensureColumns(db, auth.accountId));
}

/** DELETE — só colunas criadas pelo usuário; os leads voltam para a coluna do estágio deles */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canManageColumns(auth.user)) {
    return NextResponse.json({ error: "Só o administrador pode mudar as colunas do funil." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const col = await own(auth.accountId, id);
  if (!col) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
  if (col.kind !== "CUSTOM") {
    return NextResponse.json({ error: "Esta coluna é fixa do funil: pode renomear, mas não apagar." }, { status: 400 });
  }
  await db.delete(funnelColumns).where(eq(funnelColumns.id, id));
  return NextResponse.json(await ensureColumns(db, auth.accountId));
}
