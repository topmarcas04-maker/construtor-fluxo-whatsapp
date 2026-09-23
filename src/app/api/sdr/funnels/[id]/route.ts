export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funnels, leads, productCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { funnelsWithColumns } from "@/lib/funnel/shared";
import { canManageColumns } from "@/lib/funnel/validate";

async function guard(id: string) {
  const auth = await requireUser("leads");
  if (auth.error) return { error: auth.error } as const;
  if (!canManageColumns(auth.user)) {
    return { error: NextResponse.json({ error: "Só o administrador pode mudar os funis." }, { status: 403 }) } as const;
  }
  const row = await db.query.funnels.findFirst({ where: and(eq(funnels.id, id), eq(funnels.accountId, auth.accountId)) });
  if (!row) return { error: NextResponse.json({ error: "Funil não encontrado" }, { status: 404 }) } as const;
  return { auth, row } as const;
}

/** PATCH { name } — renomear */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Dê um nome para o funil" }, { status: 400 });
  await db.update(funnels).set({ name }).where(eq(funnels.id, id));
  return NextResponse.json(await funnelsWithColumns(db, g.auth.accountId));
}

/** DELETE — os leads voltam para o funil principal (mantêm a etapa); as categorias deixam de apontar para ele */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (g.row.isDefault) return NextResponse.json({ error: "O funil principal não pode ser apagado." }, { status: 400 });
  await db.update(leads).set({ funnelId: null, columnId: null }).where(eq(leads.funnelId, id));
  await db.update(productCategories).set({ funnelId: null }).where(eq(productCategories.funnelId, id));
  await db.delete(funnels).where(eq(funnels.id, id));
  return NextResponse.json(await funnelsWithColumns(db, g.auth.accountId));
}
