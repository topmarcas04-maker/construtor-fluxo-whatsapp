export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funnelColumns } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureColumns, funnelsWithColumns } from "@/lib/funnel/shared";
import { columnValues, canManageColumns } from "@/lib/funnel/validate";

/** GET ?funnel=id — colunas de um funil (padrão: o principal); ?all=1 — de todos os funis */
export async function GET(req: NextRequest) {
  const auth = await requireUser(["leads", "configuracoes"]);
  if (auth.error) return auth.error;
  if (req.nextUrl.searchParams.get("all")) {
    const list = await funnelsWithColumns(db, auth.accountId);
    return NextResponse.json(list.flatMap((f) => f.columns.map((c) => ({ ...c, funnelName: f.name }))));
  }
  return NextResponse.json(await ensureColumns(db, auth.accountId, req.nextUrl.searchParams.get("funnel")));
}

/** POST — nova coluna { name, aiRule?, color? } (entra antes de "Vendas") */
export async function POST(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canManageColumns(auth.user)) {
    return NextResponse.json({ error: "Só o administrador pode mudar as colunas do funil." }, { status: 403 });
  }
  const body = await req.json();
  const parsed = columnValues(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const cols = await ensureColumns(db, auth.accountId, body.funnelId ? String(body.funnelId) : null);
  const funnelId = cols[0]?.funnelId || null;
  if (cols.length >= 15) return NextResponse.json({ error: "Máximo de 15 colunas." }, { status: 400 });

  // Nova coluna fica antes de "Vendas" (a última etapa)
  const saleIdx = cols.findIndex((c) => c.kind === "SALE");
  const insertAt = saleIdx === -1 ? cols.length : saleIdx;
  const [created] = await db
    .insert(funnelColumns)
    .values({ accountId: auth.accountId, funnelId, name: parsed.values.name as string, aiRule: parsed.values.aiRule as string | null, color: (parsed.values.color as string) || null, kind: "CUSTOM", sort: insertAt })
    .returning();
  const ordered = [...cols.slice(0, insertAt).map((c) => c.id), created.id, ...cols.slice(insertAt).map((c) => c.id)];
  await Promise.all(
    ordered.map((id, i) => db.update(funnelColumns).set({ sort: i }).where(eq(funnelColumns.id, id)))
  );
  return NextResponse.json(await ensureColumns(db, auth.accountId, funnelId));
}

