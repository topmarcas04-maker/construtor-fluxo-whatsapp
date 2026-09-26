/**
 * Agentes de IA — consultas usadas pelo site e pelo motor. Sem imports "@/".
 */
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { toProfile, type AgentProfile } from "./common";

type Db = NodePgDatabase<typeof schema>;
const { aiAgents, aiSettings } = schema;

/** Agentes da conta; se ainda não tem nenhum, cria o principal a partir da IA da conta */
export async function ensureAgents(db: Db, accountId: string): Promise<AgentProfile[]> {
  let rows = await db.select().from(aiAgents).where(eq(aiAgents.accountId, accountId)).orderBy(asc(aiAgents.sort), asc(aiAgents.createdAt));
  if (!rows.length) {
    const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, accountId) });
    await db.insert(aiAgents).values({
      accountId,
      name: "Agente Comercial",
      role: "VENDAS",
      objective: "Atender, qualificar e entregar o cliente pronto para o vendedor.",
      isPrimary: true,
      instructions: s?.systemPrompt || "",
      style: s?.style || "FRIENDLY",
      styleCustom: s?.styleCustom || null,
      replyLength: s?.replyLength || "MEDIUM",
      emojiLevel: s?.emojiLevel || "LOW",
      offerVideo: s?.offerVideo ?? true,
      qualify: s?.qualify ?? null,
    });
    rows = await db.select().from(aiAgents).where(eq(aiAgents.accountId, accountId)).orderBy(asc(aiAgents.sort), asc(aiAgents.createdAt));
  }
  // Sempre um principal
  if (!rows.some((r) => r.isPrimary)) {
    await db.update(aiAgents).set({ isPrimary: true }).where(eq(aiAgents.id, rows[0].id));
    rows[0].isPrimary = true;
  }
  return rows.map((r) => toProfile(r as unknown as Record<string, unknown>));
}

/**
 * Qual agente atende: o do lead (se ativo) → o do WhatsApp da conversa (se ativo) → o principal.
 */
export function pickAgent(agents: AgentProfile[], leadAgentId: string | null | undefined, numberAgentId: string | null | undefined) {
  const active = agents.filter((a) => a.active);
  return (
    active.find((a) => a.id === leadAgentId) ||
    active.find((a) => a.id === numberAgentId) ||
    active.find((a) => a.isPrimary) ||
    active[0] ||
    agents.find((a) => a.isPrimary) ||
    null
  );
}

/** Campos do agente principal que ficam iguais aos de ai_settings (tela antiga de Configurações) */
export async function syncPrimaryToSettings(db: Db, accountId: string, a: Pick<AgentProfile, "instructions" | "style" | "styleCustom" | "replyLength" | "emojiLevel" | "offerVideo" | "qualify">) {
  await db
    .update(aiSettings)
    .set({
      systemPrompt: a.instructions,
      style: a.style,
      styleCustom: a.styleCustom,
      replyLength: a.replyLength,
      emojiLevel: a.emojiLevel,
      offerVideo: a.offerVideo,
      qualify: a.qualify as never,
      updatedAt: new Date(),
    })
    .where(eq(aiSettings.id, accountId));
}

export async function syncSettingsToPrimary(db: Db, accountId: string, s: typeof aiSettings.$inferSelect) {
  const agents = await ensureAgents(db, accountId);
  const primary = agents.find((a) => a.isPrimary);
  if (!primary) return;
  await db
    .update(aiAgents)
    .set({
      instructions: s.systemPrompt,
      style: s.style,
      styleCustom: s.styleCustom,
      replyLength: s.replyLength,
      emojiLevel: s.emojiLevel,
      offerVideo: s.offerVideo,
      qualify: s.qualify ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(aiAgents.id, primary.id), eq(aiAgents.accountId, accountId)));
}
