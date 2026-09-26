import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, aiAgents, leads, productCategories, products, waNumbers } from "@/db/schema";
import { STYLE_PRESETS, LENGTH_OPTIONS, EMOJI_OPTIONS } from "@/lib/ai/style";
import { normalizeQualify } from "@/lib/ai/qualify";
import { ensureActions } from "@/lib/actions/shared";
import { AGENT_ROLES, MAX_AGENTS_LIMIT, normalizePermissions, normalizeRouting } from "./common";
import { ensureAgents } from "./shared";
import { normalizeWaConfig } from "@/lib/whatsapp/config";
import { slotLabels } from "@/lib/whatsapp/numbers";

/** Quantos agentes a conta pode ter (o Master pode o máximo) */
export async function agentLimit(accountId: string) {
  const a = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId), columns: { type: true, maxAgents: true } });
  if (a?.type === "MASTER") return MAX_AGENTS_LIMIT;
  return Math.max(1, Math.min(MAX_AGENTS_LIMIT, a?.maxAgents || 1));
}

/** Lista para a tela: agentes, números de conversas, canais vinculados e opções de produtos/ações */
export async function agentsPayload(accountId: string) {
  const agents = await ensureAgents(db, accountId);
  const [counts, numberRows, labels, prods, cats, actions, limit] = await Promise.all([
    db
      .select({ agentId: leads.agentId, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.accountId, accountId))
      .groupBy(leads.agentId),
    db.select({ slot: waNumbers.slot, config: waNumbers.config }).from(waNumbers).where(eq(waNumbers.accountId, accountId)),
    slotLabels(accountId),
    db
      .select({ id: products.id, name: products.name, categoryId: products.categoryId, active: products.active })
      .from(products)
      .where(eq(products.accountId, accountId))
      .orderBy(asc(products.sort), asc(products.name)),
    db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories).where(eq(productCategories.accountId, accountId)),
    ensureActions(db, accountId),
    agentLimit(accountId),
  ]);
  const primaryId = agents.find((a) => a.isPrimary)?.id;
  const channels = (agentId: string) =>
    [1, 2, 3]
      .filter((slot) => {
        const cfg = normalizeWaConfig(numberRows.find((r) => r.slot === slot)?.config);
        return cfg.agentId === agentId;
      })
      .map((slot) => labels[slot] || `WhatsApp ${slot}`);
  return {
    agents: agents.map((a) => ({
      ...a,
      // Leads sem agente definido são atendidos pelo principal
      conversations: (counts.find((c) => c.agentId === a.id)?.n || 0) + (a.id === primaryId ? counts.find((c) => c.agentId === null)?.n || 0 : 0),
      channels: channels(a.id),
    })),
    limit,
    options: {
      products: prods,
      categories: cats,
      actions: actions.map((x) => ({ id: x.id, name: x.name, active: x.active })),
    },
  };
}

const pick = <T extends readonly { key: string }[]>(list: T, v: unknown, fallback: string) =>
  list.some((o) => o.key === v) ? String(v) : fallback;

/** Valida o que veio da tela (só ids desta conta) */
export async function agentValues(accountId: string, body: Record<string, unknown>) {
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return { error: "Dê um nome ao agente" } as const;
  const idList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, 500) : []);
  const [prods, cats, actions, agentRows] = await Promise.all([
    db.select({ id: products.id }).from(products).where(eq(products.accountId, accountId)),
    db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.accountId, accountId)),
    ensureActions(db, accountId),
    db.select({ id: aiAgents.id }).from(aiAgents).where(eq(aiAgents.accountId, accountId)),
  ]);
  const has = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const agIds = has(agentRows);
  const routing = normalizeRouting(body.routing);
  routing.transferTo = routing.transferTo.filter((id) => agIds.has(id));
  const pIds = has(prods);
  const cIds = has(cats);
  const aIds = has(actions);
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
      productIds: idList(body.productIds).filter((id) => pIds.has(id)),
      categoryIds: idList(body.categoryIds).filter((id) => cIds.has(id)),
      actionIds: idList(body.actionIds).filter((id) => aIds.has(id)),
      permissions: normalizePermissions(body.permissions),
      routing,
    },
  } as const;
}

export async function ownAgent(accountId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return db.query.aiAgents.findFirst({ where: and(eq(aiAgents.id, id), eq(aiAgents.accountId, accountId)) });
}

/** Tira o agente dos números e dos leads (ao excluir) */
export async function detachAgent(accountId: string, agentId: string) {
  await db.update(leads).set({ agentId: null }).where(and(eq(leads.accountId, accountId), eq(leads.agentId, agentId)));
  const rows = await db.select().from(waNumbers).where(eq(waNumbers.accountId, accountId));
  for (const r of rows) {
    const cfg = normalizeWaConfig(r.config);
    if (cfg.agentId === agentId) await db.update(waNumbers).set({ config: { ...cfg, agentId: null } }).where(eq(waNumbers.id, r.id));
  }
}

