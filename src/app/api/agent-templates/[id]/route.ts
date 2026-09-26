export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { allTemplates, isMasterUser, templatePayload, templateValues } from "@/lib/agents/templates";

type Ctx = { params: Promise<{ id: string }> };

async function guard(c: Ctx) {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error } as const;
  if (!isMasterUser(auth.user)) return { error: NextResponse.json({ error: "Só o Master edita modelos" }, { status: 403 }) } as const;
  const { id } = await c.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: "Modelo inválido" }, { status: 400 }) } as const;
  const t = await db.query.agentTemplates.findFirst({ where: eq(agentTemplates.id, id) });
  if (!t) return { error: NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 }) } as const;
  return { t } as const;
}

/** Salva o modelo (as contas trazem as mudanças com "Atualizar do modelo") */
export async function PATCH(req: NextRequest, c: Ctx) {
  const g = await guard(c);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    await db.update(agentTemplates).set({ active: body.active, updatedAt: new Date() }).where(eq(agentTemplates.id, g.t.id));
  } else {
    const parsed = await templateValues({ ...g.t, ...body });
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await db.update(agentTemplates).set({ ...parsed.values, updatedAt: new Date() }).where(eq(agentTemplates.id, g.t.id));
  }
  return NextResponse.json({ canManage: true, templates: templatePayload(await allTemplates()) });
}

/** Exclui o modelo. Os agentes que as contas já receberam continuam (só perdem o "Atualizar do modelo"). */
export async function DELETE(_req: NextRequest, c: Ctx) {
  const g = await guard(c);
  if ("error" in g) return g.error;
  await db.delete(agentTemplates).where(eq(agentTemplates.id, g.t.id));
  return NextResponse.json({ canManage: true, templates: templatePayload(await allTemplates()) });
}
