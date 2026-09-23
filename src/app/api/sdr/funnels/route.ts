export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { funnels } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ensureFunnels, funnelsWithColumns } from "@/lib/funnel/shared";
import { canManageColumns } from "@/lib/funnel/validate";

/** GET — funis da conta com as colunas de cada um */
export async function GET() {
  const auth = await requireUser(["leads", "configuracoes", "produtos"]);
  if (auth.error) return auth.error;
  return NextResponse.json(await funnelsWithColumns(db, auth.accountId));
}

/** POST { name } — novo funil (já vem com as colunas fixas) */
export async function POST(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  if (!canManageColumns(auth.user)) {
    return NextResponse.json({ error: "Só o administrador pode criar funis." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Dê um nome para o funil" }, { status: 400 });
  const list = await ensureFunnels(db, auth.accountId);
  if (list.length >= 10) return NextResponse.json({ error: "Máximo de 10 funis." }, { status: 400 });
  await db.insert(funnels).values({ accountId: auth.accountId, name, sort: list.length });
  return NextResponse.json(await funnelsWithColumns(db, auth.accountId));
}
