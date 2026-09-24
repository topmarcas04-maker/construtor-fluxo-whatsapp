/**
 * Qualificação do lead: o que a IA pergunta ao cliente e se pergunta antes de passar o preço.
 * Sem dependências (tela, site e motor).
 */

export const QUALIFY_FIELDS = [
  { key: "name", label: "Nome", ask: "o nome dele" },
  { key: "city", label: "Cidade", ask: "a cidade" },
  { key: "address", label: "Bairro / endereço", ask: "o bairro ou endereço" },
  { key: "use", label: "Para que vai usar", ask: "para que vai usar (ex.: trabalho, passeio, entregas)" },
  { key: "payment", label: "Forma de pagamento", ask: "como pretende pagar (à vista, cartão, financiamento, entrada + parcelas)" },
  { key: "when", label: "Quando pretende comprar", ask: "quando pretende comprar" },
] as const;

export const QUALIFY_MODES = [
  { key: "OFF", label: "Não pedir", hint: "A IA responde direto, sem pedir dados." },
  { key: "ALONG", label: "Pedir junto", hint: "Responde o que o cliente perguntou (até o preço) e aproveita para pedir um dado." },
  { key: "BEFORE_PRICE", label: "Antes de informar", hint: "Pede os dados primeiro (mesmo quando o cliente vem do anúncio) e só depois passa informações, preço e condições." },
] as const;

export type QualifyMode = (typeof QUALIFY_MODES)[number]["key"];

export interface QualifySettings {
  mode: QualifyMode;
  fields: string[];
  /** Outras perguntas escritas pela empresa */
  custom: string;
}

export const DEFAULT_QUALIFY: QualifySettings = { mode: "OFF", fields: ["name", "city"], custom: "" };

export function normalizeQualify(v: unknown): QualifySettings {
  const o = (v && typeof v === "object" ? v : {}) as Partial<QualifySettings>;
  const mode = QUALIFY_MODES.some((m) => m.key === o.mode) ? (o.mode as QualifyMode) : DEFAULT_QUALIFY.mode;
  const fields = Array.isArray(o.fields)
    ? QUALIFY_FIELDS.map((f) => f.key).filter((k) => (o.fields as unknown[]).includes(k))
    : DEFAULT_QUALIFY.fields;
  return { mode, fields, custom: typeof o.custom === "string" ? o.custom.slice(0, 1000) : "" };
}

const ESSENTIAL_KEYS = ["name", "city", "address", "use"];
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Dados que precisam vir antes das informações (até 2) */
export function qualifyEssentials(q: QualifySettings) {
  return QUALIFY_FIELDS.filter((f) => q.fields.includes(f.key) && ESSENTIAL_KEYS.includes(f.key)).slice(0, 2).map((f) => f.key as string);
}

/** Depois de quantas mensagens do cliente sem responder a IA libera as informações (para não perder a venda) */
export const QUALIFY_RELEASE_AFTER = 3;

/**
 * Informações ainda travadas? (modo "Antes de informar", lead ainda não qualificado e o cliente
 * não insistiu demais). Enquanto travado, preço e detalhes nem chegam à IA.
 */
export function qualifyPending(q: QualifySettings, s: { qualifiedAt?: Date | string | null; leadMessages: number }) {
  return q.mode === "BEFORE_PRICE" && qualifyEssentials(q).length > 0 && !s.qualifiedAt && s.leadMessages < QUALIFY_RELEASE_AFTER;
}

/**
 * O cliente já informou os dados principais? O nome só vale se aparece no que o cliente escreveu
 * (o nome do perfil do WhatsApp não conta).
 */
export function isQualified(q: QualifySettings, d: { name?: string | null; city?: string | null }, leadTexts: string[], knownCity?: string | null) {
  const said = norm(leadTexts.join(" \n "));
  return qualifyEssentials(q).every((k) => {
    if (k === "name") {
      const first = norm((d.name || "").trim().split(/\s+/)[0] || "");
      return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first.replace(/[^a-z0-9]/g, "")}([^a-z0-9]|$)`).test(said);
    }
    if (k === "city") return Boolean((d.city || knownCity || "").trim());
    return true;
  });
}

/** Item do catálogo sem preço, parcelas nem especificações (enquanto o lead não foi qualificado) */
export function maskCatalogItem<T extends { price: string; description: string | null; installments?: string[]; details?: string[]; hasVideo?: boolean }>(
  item: T
): T {
  return { ...item, price: "(liberado depois que souber os dados do cliente)", description: null, installments: [], details: [], hasVideo: false };
}

/** Bloco do prompt da IA */
export function qualifyBlock(
  q: QualifySettings | undefined,
  known: { name?: string | null; city?: string | null },
  pending = false
) {
  if (!q || q.mode === "OFF") return "";
  // O nome que vem do perfil do WhatsApp pode ser apelido, empresa ou emoji: a IA confere na conversa.
  // A cidade só é preenchida quando o cliente informa, então essa é confiável.
  const missing = QUALIFY_FIELDS.filter((f) => q.fields.includes(f.key)).filter((f) => !(f.key === "city" && known.city));
  const custom = q.custom.trim();
  if (!missing.length && !custom) return "";
  const list = [missing.length ? missing.map((f) => f.ask).join("; ") : null, custom ? `e também: ${custom}` : null].filter(Boolean).join("; ");
  // Antes de passar as informações bastam até 2 dados principais (nome, cidade, endereço, uso); pagamento e prazo vêm depois
  const essentials = missing.filter((f) => ["name", "city", "address", "use"].includes(f.key)).slice(0, 2);
  const lines = [
    `- Dados para esquentar o lead: ${list}. Pergunte só o que o cliente ainda NÃO disse nesta conversa.`,
    q.fields.includes("name")
      ? `- O nome do perfil do WhatsApp${known.name ? ` ("${known.name}")` : ""} pode ser apelido, nome de empresa ou emoji. Se o cliente ainda não disse o nome dele na conversa, pergunte.`
      : "",
    `- Pergunte de forma natural, no máximo UMA ou DUAS coisas por mensagem, nunca como formulário.`,
  ].filter(Boolean);
  if (q.mode === "BEFORE_PRICE" && essentials.length) {
    const need = essentials.map((f) => f.ask).join(" e ");
    lines.push(
      `- IMPORTANTE: enquanto não souber ${need}, NÃO passe preço, parcelas, promoções, condições NEM a lista de especificações do produto. Isso vale principalmente quando o cliente chega pelo anúncio com a mensagem pronta ("quero mais informações sobre...") ou pergunta o preço logo de cara.`,
      `- Na primeira resposta: cumprimente, mostre que entendeu qual produto ele quer (uma frase curta, sem detalhes técnicos) e peça ${need}, dizendo que é para passar as informações e a melhor condição pra ele. Ex.: "Oi! Que bom que gostou da FX2 😊 Já te passo tudo! Qual seu nome e de qual cidade você fala?". Pode mandar a foto do produto junto.`,
      `- Se o cliente pedir as informações ou o preço de novo sem responder, não trave a conversa: passe o que ele pediu e continue pedindo o que falta.`,
      `- Assim que souber, passe as informações e as condições aos poucos; as outras perguntas podem vir depois, junto com a conversa.`
    );
  } else {
    lines.push(`- Responda o que o cliente perguntou (inclusive o preço) e, na mesma mensagem, peça um dado que falta.`);
  }
  if (pending)
    lines.push(
      `- AGORA: preço, parcelas e especificações estão ocultos no catálogo até você saber ${qualifyEssentials(q)
        .map((k) => QUALIFY_FIELDS.find((f) => f.key === k)!.ask)
        .join(" e ")}. Não diga que não sabe o preço: diga que já vai passar tudo e peça esses dados. Preencha "nome" somente com o nome que o cliente escreveu.`
    );
  return `\n\nQUALIFICAÇÃO DO LEAD\n${lines.join("\n")}`;
}
