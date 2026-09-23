export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funnelColumns } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureColumns } from "@/lib/funnel/shared";
import { canManageColumns } from "@/lib/funnel/validate";

/** POST { ids: [...] } — nova ordem das colunas */
export async function POST(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canManageColumns(auth.user)) {
    return NextResponse.json({ error: "Só o administrador pode mudar as colunas do funil." }, { status: 403 });
  }
  const body = await req.json();
  const cols = await ensureColumns(db, auth.accountId, body.funnelId ? String(body.funnelId) : null);
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const known = new Set(cols.map((c) => c.id));
  const ordered = [...ids.filter((i) => known.has(i)), ...cols.map((c) => c.id).filter((i) => !ids.includes(i))];
  await Promise.all(ordered.map((id, i) => db.update(funnelColumns).set({ sort: i }).where(eq(funnelColumns.id, id))));
  return NextResponse.json(await ensureColumns(db, auth.accountId, cols[0]?.funnelId));
}
