/**
 * Modelos de agente: o Master cria; libera por conta (accounts.agent_template_ids);
 * o parceiro repassa aos clientes os que recebeu. A conta recebe cópias desativadas.
 */
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, agentTemplates, aiAgents } from "@/db/schema";
import { STYLE_PRESETS, LENGTH_OPTIONS, EMOJI_OPTIONS } from "@/lib/ai/style";
import { normalizeQualify } from "@/lib/ai/qualify";
import { AGENT_ROLES, normalizePermissions, normalizeRouting, toProfile } from "./common";
import { ensureAgents } from "./shared";
import { TEMPLATE_SEEDS } from "./templateSeed";

export type TemplateRow = typeof agentTemplates.$inferSelect;

/** Cria os modelos prontos uma única vez (se o Master apagar, não voltam sozinhos) */
async function ensureSeed() {
  const res = await db.execute(
    sql`INSERT INTO app_migrations (key) VALUES ('seed-agent-templates-v1') ON CONFLICT DO NOTHING RETURNING key`
  );
  const rows = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
  if (!Array.isArray(rows) || !rows.length) return;
  await db.insert(agentTemplates).values(
    TEMPLATE_SEEDS.map((t, i) => ({
      name: t.name,
      role: t.role,
      objective: t.objective,
      description: t.description,
      instructions: t.instructions,
      style: t.style,
      replyLength: t.replyLength,
      emojiLevel: t.emojiLevel,
      offerVideo: t.offerVideo,
      qualify: normalizeQualify(t.qualify),
      permissions: t.permissions,
      routing: t.routing,
      sort: i,
    }))
  );
}

export async function allTemplates() {
  await ensureSeed();
  return db.select().from(agentTemplates).orderBy(asc(agentTemplates.sort), asc(agentTemplates.createdAt));
}

/** Modelos que esta conta pode usar/repassar: Master = todos os disponíveis; demais = os liberados */
export async function templatesFor(accountId: string) {
  const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { type: true, agentTemplateIds: true } });
  const list = (await allTemplates()).filter((t) => t.active);
  if (acc?.type === "MASTER") return list;
  const ids = new Set(acc?.agentTemplateIds || []);
  return list.filter((t) => ids.has(t.id));
}

const pick = <T extends readonly { key: string }[]>(list: T, v: unknown, fallback: string) =>
  list.some((o) => o.key === v) ? String(v) : fallback;

/** Valida o modelo vindo da tela */
export async function templateValues(body: Record<string, unknown>) {
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return { error: "Dê um nome ao modelo" } as const;
  const routing = normalizeRouting(body.routing);
  const existing = new Set((await db.select({ id: agentTemplates.id }).from(agentTemplates)).map((t) => t.id));
  routing.transferTo = routing.transferTo.filter((id) => existing.has(id));
  routing.keywords = [];
  return {
    values: {
      name,
      description: String(body.description || "").trim().slice(0, 500) || null,
      role: pick(AGENT_ROLES, body.role, "CUSTOM"),
      roleCustom: String(body.roleCustom || "").trim().slice(0, 60) || null,
      objective: String(body.objective || "").trim().slice(0, 1000) || null,
      active: body.active !== false,
      instructions: String(body.instructions || "").slice(0, 20000),
      style: pick(STYLE_PRESETS, body.style, "FRIENDLY"),
      styleCustom: String(body.styleCustom || "").slice(0, 3000) || null,
      replyLength: pick(LENGTH_OPTIONS, body.replyLength, "MEDIUM"),
      emojiLevel: pick(EMOJI_OPTIONS, body.emojiLevel, "LOW"),
      offerVideo: body.offerVideo !== false,
      qualify: body.qualify && typeof body.qualify === "object" ? normalizeQualify(body.qualify) : null,
      permissions: normalizePermissions(body.permissions),
      routing,
    },
  } as const;
}

/** Campos do modelo que vão para o agente (produtos, ações, palavras-chave e números ficam com a conta) */
async function fieldsFromTemplate(accountId: string, t: TemplateRow, keepRouting?: unknown) {
  const tr = normalizeRouting(t.routing);
  const own = normalizeRouting(keepRouting);
  // transferTo do modelo aponta para outros modelos: troca pelos agentes da conta que vieram deles
  const targets = tr.transferTo.length
    ? await db
        .select({ id: aiAgents.id })
        .from(aiAgents)
        .where(and(eq(aiAgents.accountId, accountId), inArray(aiAgents.templateId, tr.transferTo)))
    : [];
  return {
    name: t.name,
    description: t.description,
    role: t.role,
    roleCustom: t.roleCustom,
    objective: t.objective,
    instructions: t.instructions,
    style: t.style,
    styleCustom: t.styleCustom,
    replyLength: t.replyLength,
    emojiLevel: t.emojiLevel,
    offerVideo: t.offerVideo,
    qualify: t.qualify,
    permissions: normalizePermissions(t.permissions),
    routing: {
      intents: tr.intents,
      hint: tr.hint,
      keywords: own.keywords,
      router: own.router,
      transferTo: targets.map((x) => x.id),
    },
  };
}

/** Cria na conta a cópia (desativada) de cada modelo liberado que ela ainda não tem */
export async function materializeTemplates(accountId: string, onlyIds?: string[]) {
  const list = (await templatesFor(accountId)).filter((t) => !onlyIds || onlyIds.includes(t.id));
  if (!list.length) return 0;
  await ensureAgents(db, accountId);
  const have = await db
    .select({ templateId: aiAgents.templateId })
    .from(aiAgents)
    .where(and(eq(aiAgents.accountId, accountId), isNotNull(aiAgents.templateId)));
  const got = new Set(have.map((h) => h.templateId));
  const missing = list.filter((t) => !got.has(t.id));
  if (!missing.length) return 0;
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(aiAgents).where(eq(aiAgents.accountId, accountId))) as { n: number }[];
  let sort = n;
  for (const t of missing) {
    const f = await fieldsFromTemplate(accountId, t);
    // Na conta, o roteador só vale no principal: a cópia chega sem ele
    await db.insert(aiAgents).values({ ...f, routing: { ...f.routing, router: false }, accountId, templateId: t.id, active: false, isPrimary: false, sort: sort++ });
  }
  // Agora que todas existem, liga as transferências entre as cópias
  for (const t of missing) {
    if (!normalizeRouting(t.routing).transferTo.length) continue;
    const f = await fieldsFromTemplate(accountId, t);
    await db
      .update(aiAgents)
      .set({ routing: { ...f.routing, router: false } })
      .where(and(eq(aiAgents.accountId, accountId), eq(aiAgents.templateId, t.id)));
  }
  return missing.length;
}

/** "Atualizar do modelo": traz instruções, estilo, qualificação, permissões e assuntos; mantém produtos, ações, palavras-chave, status e nome */
export async function syncAgentFromTemplate(accountId: string, agentId: string) {
  const agent = await db.query.aiAgents.findFirst({ where: and(eq(aiAgents.id, agentId), eq(aiAgents.accountId, accountId)) });
  if (!agent?.templateId) return { error: "Este agente não veio de um modelo" } as const;
  const t = (await templatesFor(accountId)).find((x) => x.id === agent.templateId);
  if (!t) return { error: "O modelo deste agente não está mais liberado para a sua conta" } as const;
  const f = await fieldsFromTemplate(accountId, t, agent.routing);
  const { name: _name, ...rest } = f;
  void _name;
  await db.update(aiAgents).set({ ...rest, updatedAt: new Date() }).where(eq(aiAgents.id, agentId));
  return { ok: true, agent: { ...agent, ...rest } } as const;
}

/** Master de verdade (não quando está visualizando outra conta) */
export function isMasterUser(user: { role: string; homeAccount: { type: string }; actingAs: boolean }) {
  return user.role === "MASTER" && user.homeAccount.type === "MASTER" && !user.actingAs;
}

/** Formato da tela (igual ao de um agente) */
export function templatePayload(rows: TemplateRow[]) {
  return rows.map((t) => ({
    ...toProfile({ ...t, productIds: [], categoryIds: [], actionIds: [], isPrimary: false } as unknown as Record<string, unknown>),
    conversations: 0,
    channels: [] as string[],
  }));
}

