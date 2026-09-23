/**
 * Chatbot de menu (sem IA) — tipos e regras usados no navegador, no site e no motor.
 * Sem dependências.
 *
 * Como funciona: cada passo manda uma mensagem com opções numeradas. O cliente responde
 * com o número (ou o texto da opção) e o sistema executa o que foi configurado:
 * responde, marca etiqueta, move o card, escolhe vendedor e segue para outro passo
 * ou encerra (passando para a equipe ou para a IA).
 */

export type BotTrigger = "START" | "KEYWORD" | "TAG";
/** O que acontece depois: outro passo, equipe, IA ou só encerrar */
export type BotNext = "STEP" | "HUMAN" | "AI" | "END";

export interface BotOption {
  id: string;
  /** Número que o cliente digita (1, 2, 3...) */
  key: string;
  label: string;
  /** Mensagem enviada ao escolher (opcional) */
  reply: string;
  addTagIds: string[];
  removeTagIds: string[];
  /** Coluna do funil para onde vai o card (opcional) */
  columnId: string | null;
  /** Vendedor: id, "AUTO" (regras de distribuição) ou null */
  sellerId: string | null;
  next: BotNext;
  /** Quando next = STEP */
  stepId: string | null;
}

export interface BotStep {
  id: string;
  name: string;
  message: string;
  options: BotOption[];
  /** Passo sem opções: o que fazer depois de mandar a mensagem */
  next: Exclude<BotNext, "STEP">;
}

export interface Chatbot {
  id: string;
  name: string;
  active: boolean;
  trigger: BotTrigger;
  keywords: string[];
  tagIds: string[];
  skipTagIds: string[];
  channels: string[];
  restartHours: number;
  steps: BotStep[];
  fallbackMessage: string | null;
  maxTries: number;
  afterFail: Exclude<BotNext, "STEP">;
  sort: number;
}

export const BOT_CHANNELS = [
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "INSTAGRAM", label: "Instagram" },
  { key: "MESSENGER", label: "Messenger" },
] as const;

export const TRIGGER_LABEL: Record<BotTrigger, string> = {
  START: "Início de conversa",
  KEYWORD: "Palavra-chave",
  TAG: "Etiqueta",
};

export const NEXT_LABEL: Record<BotNext, string> = {
  STEP: "Ir para outro passo",
  HUMAN: "Passar para a equipe",
  AI: "Passar para a IA",
  END: "Encerrar",
};

export const DEFAULT_FALLBACK = "Não entendi 😅 Responda só com o *número* da opção:";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyOption(key: string): BotOption {
  return {
    id: newId(),
    key,
    label: "",
    reply: "",
    addTagIds: [],
    removeTagIds: [],
    columnId: null,
    sellerId: null,
    next: "HUMAN",
    stepId: null,
  };
}

/** Modelo pronto para começar (menu de atendimento) */
export function templateSteps(): BotStep[] {
  const main = newId();
  const buy = newId();
  const opt = (key: string, label: string, extra: Partial<BotOption>): BotOption => ({ ...emptyOption(key), label, ...extra });
  return [
    {
      id: main,
      name: "Menu principal",
      message: "Olá, {nome}! 👋 Seja bem-vindo(a). Como podemos ajudar?",
      next: "END",
      options: [
        opt("1", "Quero comprar", { next: "STEP", stepId: buy }),
        opt("2", "Suporte / dúvidas", {
          reply: "Certo! Já vou chamar alguém da equipe para te ajudar. 🙂",
          next: "HUMAN",
        }),
        opt("3", "Falar com um atendente", {
          reply: "Perfeito! Um atendente vai falar com você em instantes.",
          next: "HUMAN",
        }),
      ],
    },
    {
      id: buy,
      name: "Compras",
      message: "Ótimo! O que você procura?",
      next: "END",
      options: [
        opt("1", "Ver produtos e preços", {
          reply: "Vou te passar para um vendedor que já te manda as opções. 😉",
          next: "HUMAN",
          sellerId: "AUTO",
        }),
        opt("2", "Voltar ao menu", { next: "STEP", stepId: main }),
      ],
    },
  ];
}

/** Sem acento, minúsculo, sem pontuação nas pontas */
export function normalize(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*_~`"'“”.!?,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KEYCAPS: Record<string, string> = {
  "0️⃣": "0", "1️⃣": "1", "2️⃣": "2", "3️⃣": "3", "4️⃣": "4", "5️⃣": "5", "6️⃣": "6", "7️⃣": "7", "8️⃣": "8", "9️⃣": "9", "🔟": "10",
};

/** Qual opção o cliente escolheu ("1", "1 - comprar", "opção 1", "quero comprar"...) */
export function matchOption(options: BotOption[], answer: string): BotOption | null {
  let raw = (answer || "").trim();
  for (const [k, v] of Object.entries(KEYCAPS)) raw = raw.split(k).join(v);
  const text = normalize(raw);
  if (!text) return null;
  // Número no começo (ou "opção 2")
  const num = /^(?:opcao|opc|op|numero|n)?\s*(\d{1,2})(?!\d)/.exec(text);
  if (num) {
    const byKey = options.find((o) => normalize(o.key) === num[1]);
    if (byKey) return byKey;
  }
  const byKeyExact = options.find((o) => normalize(o.key) === text);
  if (byKeyExact) return byKeyExact;
  // Texto da opção
  const byLabel = options.find((o) => normalize(o.label) && normalize(o.label) === text);
  if (byLabel) return byLabel;
  if (text.length >= 4) {
    const contains = options.filter((o) => {
      const l = normalize(o.label);
      return l.length >= 3 && (text.includes(l) || l.includes(text));
    });
    if (contains.length === 1) return contains[0];
    // Palavras em comum ("quero ver os preços" → "Ver produtos e preços")
    const words = new Set(text.split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
    if (words.size) {
      const scored = options
        .map((o) => ({ o, n: normalize(o.label).split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w) && words.has(w)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n);
      if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return scored[0].o;
    }
  }
  return null;
}

const STOPWORDS = new Set([
  "quero", "queria", "gostaria", "preciso", "para", "sobre", "mais", "menos", "voce", "voces", "esta", "estou", "isso", "esse",
  "essa", "aqui", "agora", "favor", "obrigado", "obrigada", "pode", "podem", "como", "qual", "quais", "onde", "quando", "tenho",
  "fazer", "saber", "falar", "opcao", "numero",
]);

/** A mensagem tem alguma das palavras-chave? (palavra inteira, sem acento) */
export function matchKeyword(keywords: string[], message: string) {
  const text = ` ${normalize(message)} `;
  return keywords.some((k) => {
    const n = normalize(k);
    return n.length > 0 && text.includes(` ${n} `);
  });
}

/** Troca {nome} pelo primeiro nome do cliente */
export function fillBotText(text: string, vars: { nome?: string | null }) {
  const first = (vars.nome || "").trim().split(/\s+/)[0] || "";
  return (text || "")
    .replace(/,?\s*\{nome\}/gi, (m) => (first ? m.replace(/\{nome\}/i, first) : ""))
    .trim();
}

/** Texto do passo com a lista de opções ("*1* - Comprar") */
export function renderStep(step: BotStep, vars: { nome?: string | null } = {}) {
  const head = fillBotText(step.message, vars);
  if (!step.options.length) return head;
  const list = step.options.map((o) => `*${o.key}* - ${o.label}`).join("\n");
  return head ? `${head}\n\n${list}` : list;
}

/** Descrição curta do gatilho para listas */
export function triggerSummary(bot: Pick<Chatbot, "trigger" | "keywords" | "tagIds" | "restartHours">, tagName: (id: string) => string) {
  if (bot.trigger === "KEYWORD") return `Palavra-chave: ${bot.keywords.join(", ") || "—"}`;
  if (bot.trigger === "TAG") return `Etiqueta: ${bot.tagIds.map(tagName).join(", ") || "—"}`;
  return `Início de conversa (volta após ${bot.restartHours}h)`;
}
