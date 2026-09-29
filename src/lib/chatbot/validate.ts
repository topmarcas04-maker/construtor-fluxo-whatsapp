/**
 * Validação do chatbot enviado pela tela. Sem dependências (roda no servidor).
 */
import type { BotMedia, BotNext, BotOption, BotStep, BotTrigger, StepKind } from "./common";

const TRIGGERS: BotTrigger[] = ["START", "KEYWORD", "TAG"];
const NEXTS: BotNext[] = ["STEP", "HUMAN", "AI", "END"];
const CHANNELS = ["WHATSAPP", "INSTAGRAM", "MESSENGER"];

export const MAX_STEPS = 60;
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
  /** Arquivos do Drive da conta (id → dados) para os blocos de mídia */
  files: Map<string, { name: string; mime: string; size: number; kind: string }>;
}

const KINDS: StepKind[] = ["MENU", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"];
const FILE_KIND: Record<Exclude<StepKind, "MENU">, string[]> = {
  IMAGE: ["image"],
  AUDIO: ["audio"],
  VIDEO: ["video"],
  DOCUMENT: ["document", "image", "video", "audio"],
};

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

  if (!Array.isArray(body.steps) || !body.steps.length) return { error: "Crie pelo menos um bloco" };
  if (body.steps.length > MAX_STEPS) return { error: `Máximo de ${MAX_STEPS} blocos` };
  const stepIds = new Set(body.steps.map((s) => str((s as BotStep)?.id, 40)).filter(Boolean));

  const steps: BotStep[] = [];
  for (const [i, raw] of (body.steps as Record<string, unknown>[]).entries()) {
    const id = str(raw?.id, 40);
    if (!id) return { error: `Passo ${i + 1}: sem identificação` };
    const kind: StepKind = KINDS.includes(raw.kind as StepKind) ? (raw.kind as StepKind) : "MENU";
    const blockName = str(raw.name, 60) || `Bloco ${i + 1}`;
    const message = kind === "AUDIO" ? "" : str(raw.message, kind === "MENU" ? 1500 : 1000);
    const options = kind === "MENU" && Array.isArray(raw.options) ? raw.options : [];
    if (options.length > MAX_OPTIONS) return { error: `${blockName}: máximo de ${MAX_OPTIONS} opções` };
    if (kind === "MENU" && !message && !options.length) return { error: `${blockName}: escreva a mensagem` };
    let media: BotMedia | null = null;
    if (kind !== "MENU") {
      const m = (raw.media || {}) as Record<string, unknown>;
      const f = refs.files.get(String(m.fileId || ""));
      if (!f) return { error: `${blockName}: envie o arquivo do bloco` };
      if (!FILE_KIND[kind].includes(f.kind)) return { error: `${blockName}: o arquivo não é do tipo certo` };
      media = { fileId: String(m.fileId), name: f.name, mime: f.mime, size: f.size };
    }
    const keys = new Set<string>();
    const opts: BotOption[] = [];
    for (const [j, o] of (options as Record<string, unknown>[]).entries()) {
      const key = str(o?.key, 3) || String(j + 1);
      const label = str(o?.label, 80);
      if (!label) return { error: `${blockName}: a opção ${key} está sem texto` };
      if (keys.has(key)) return { error: `${blockName}: o número ${key} está repetido` };
      keys.add(key);
      const next = NEXTS.includes(o.next as BotNext) ? (o.next as BotNext) : "END";
      const stepId = next === "STEP" ? str(o.stepId, 40) : null;
      if (next === "STEP" && (!stepId || !stepIds.has(stepId))) {
        return { error: `${blockName}, opção ${key}: ligue a opção a um bloco ou escolha o que fazer` };
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
    let stepNext: BotNext = NEXTS.includes(raw.next as BotNext) ? (raw.next as BotNext) : "END";
    let nextStepId: string | null = stepNext === "STEP" ? str(raw.nextStepId, 40) : null;
    if (stepNext === "STEP" && (!nextStepId || !stepIds.has(nextStepId) || nextStepId === id)) {
      stepNext = "END";
      nextStepId = null;
    }
    const px = Number((raw.pos as { x?: unknown } | null)?.x);
    const py = Number((raw.pos as { y?: unknown } | null)?.y);
    const pos = Number.isFinite(px) && Number.isFinite(py) ? { x: Math.round(px), y: Math.round(py) } : null;
    steps.push({ id, name: blockName, message, options: opts, next: stepNext, nextStepId, kind, media, pos });
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
