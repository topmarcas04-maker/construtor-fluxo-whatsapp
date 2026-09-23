/**
 * Validação do chatbot enviado pela tela. Sem dependências (roda no servidor).
 */
import type { BotNext, BotOption, BotStep, BotTrigger } from "./common";

const TRIGGERS: BotTrigger[] = ["START", "KEYWORD", "TAG"];
const NEXTS: BotNext[] = ["STEP", "HUMAN", "AI", "END"];
const CHANNELS = ["WHATSAPP", "INSTAGRAM", "MESSENGER"];

export const MAX_STEPS = 20;
export const MAX_OPTIONS = 10;

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const ids = (v: unknown, allowed?: Set<string>) =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => String(x)).filter((x) => /^[0-9a-f-]{36}$/i.test(x) && (!allowed || allowed.has(x))))].slice(0, 30)
    : [];

export interface BotRefs {
  tagIds: Set<string>;
  columnIds: Set<string>;
  sellerIds: Set<string>;
}

export function chatbotValues(body: Record<string, unknown>, refs: BotRefs): { error: string } | { values: Record<string, unknown> } {
  const name = str(body.name, 120);
  if (!name) return { error: "Dê um nome ao chatbot" };
  const trigger = TRIGGERS.includes(body.trigger as BotTrigger) ? (body.trigger as BotTrigger) : "START";

  const keywords = Array.isArray(body.keywords)
    ? [...new Set(body.keywords.map((k) => str(k, 40)).filter(Boolean))].slice(0, 20)
    : [];
  const tagIds = ids(body.tagIds, refs.tagIds);
  if (trigger === "KEYWORD" && !keywords.length) return { error: "Informe pelo menos uma palavra-chave" };
  if (trigger === "TAG" && !tagIds.length) return { error: "Escolha pelo menos uma etiqueta que inicia o chatbot" };

  const channels = Array.isArray(body.channels) ? body.channels.map(String).filter((c) => CHANNELS.includes(c)) : CHANNELS;
  if (!channels.length) return { error: "Escolha pelo menos um canal" };

  const restart = Number(body.restartHours);
  const maxTries = Number(body.maxTries);

  if (!Array.isArray(body.steps) || !body.steps.length) return { error: "Crie pelo menos um passo" };
  if (body.steps.length > MAX_STEPS) return { error: `Máximo de ${MAX_STEPS} passos` };
  const stepIds = new Set(body.steps.map((s) => str((s as BotStep)?.id, 40)).filter(Boolean));

  const steps: BotStep[] = [];
  for (const [i, raw] of (body.steps as Record<string, unknown>[]).entries()) {
    const id = str(raw?.id, 40);
    if (!id) return { error: `Passo ${i + 1}: sem identificação` };
    const message = str(raw.message, 1500);
    const options = Array.isArray(raw.options) ? raw.options : [];
    if (options.length > MAX_OPTIONS) return { error: `Passo ${i + 1}: máximo de ${MAX_OPTIONS} opções` };
    if (!message && !options.length) return { error: `Passo ${i + 1}: escreva a mensagem` };
    const keys = new Set<string>();
    const opts: BotOption[] = [];
    for (const [j, o] of (options as Record<string, unknown>[]).entries()) {
      const key = str(o?.key, 3) || String(j + 1);
      const label = str(o?.label, 80);
      if (!label) return { error: `Passo ${i + 1}: a opção ${key} está sem texto` };
      if (keys.has(key)) return { error: `Passo ${i + 1}: o número ${key} está repetido` };
      keys.add(key);
      const next = NEXTS.includes(o.next as BotNext) ? (o.next as BotNext) : "END";
      const stepId = next === "STEP" ? str(o.stepId, 40) : null;
      if (next === "STEP" && (!stepId || !stepIds.has(stepId))) {
        return { error: `Passo ${i + 1}, opção ${key}: escolha para qual passo ir` };
      }
      const sellerRaw = o.sellerId ? String(o.sellerId) : null;
      opts.push({
        id: str(o.id, 40) || `${id}-${j}`,
        key,
        label,
        reply: str(o.reply, 1500),
        addTagIds: ids(o.addTagIds, refs.tagIds),
        removeTagIds: ids(o.removeTagIds, refs.tagIds),
        columnId: o.columnId && refs.columnIds.has(String(o.columnId)) ? String(o.columnId) : null,
        sellerId: sellerRaw === "AUTO" ? "AUTO" : sellerRaw && refs.sellerIds.has(sellerRaw) ? sellerRaw : null,
        next,
        stepId,
      });
    }
    const stepNext = ["HUMAN", "AI", "END"].includes(String(raw.next)) ? (raw.next as BotStep["next"]) : "END";
    steps.push({ id, name: str(raw.name, 60) || `Passo ${i + 1}`, message, options: opts, next: stepNext });
  }

  return {
    values: {
      name,
      active: body.active !== false,
      trigger,
      keywords,
      tagIds,
      skipTagIds: ids(body.skipTagIds, refs.tagIds),
      channels,
      restartHours: Number.isFinite(restart) ? Math.min(Math.max(Math.round(restart), 1), 720) : 24,
      steps,
      fallbackMessage: str(body.fallbackMessage, 500) || null,
      maxTries: Number.isFinite(maxTries) ? Math.min(Math.max(Math.round(maxTries), 1), 5) : 2,
      afterFail: ["HUMAN", "AI", "END"].includes(String(body.afterFail)) ? body.afterFail : "HUMAN",
    },
  };
}
