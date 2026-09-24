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
  { key: "BEFORE_PRICE", label: "Antes do preço", hint: "Pede os dados primeiro e só depois passa preço e condições." },
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

/** Bloco do prompt da IA */
export function qualifyBlock(q: QualifySettings | undefined, known: { name?: string | null; city?: string | null }) {
  if (!q || q.mode === "OFF") return "";
  const missing = QUALIFY_FIELDS.filter((f) => q.fields.includes(f.key)).filter(
    (f) => !(f.key === "name" && known.name) && !(f.key === "city" && known.city)
  );
  const custom = q.custom.trim();
  if (!missing.length && !custom) return "";
  const list = [missing.length ? missing.map((f) => f.ask).join("; ") : null, custom ? `e também: ${custom}` : null].filter(Boolean).join("; ");
  // Antes do preço bastam até 2 dados principais (nome, cidade, endereço, uso); pagamento e prazo vêm depois
  const essentials = missing.filter((f) => ["name", "city", "address", "use"].includes(f.key)).slice(0, 2);
  const lines = [
    `- Dados para esquentar o lead (pergunte o que ainda não sabe; não pergunte de novo o que já está nas informações internas ou na conversa): ${list}.`,
    `- Pergunte de forma natural, no máximo UMA ou DUAS coisas por mensagem, nunca como formulário.`,
  ];
  if (q.mode === "BEFORE_PRICE" && essentials.length) {
    const need = essentials.map((f) => f.ask).join(" e ");
    lines.push(
      `- IMPORTANTE: ainda NÃO informe preço, parcelas, promoções ou condições enquanto não souber ${need}. Isso vale mesmo que o cliente chegue pelo anúncio já com o nome do produto ou pergunte o preço logo de cara.`,
      `- Nesse caso: agradeça o interesse, confirme o produto e peça ${need}, mostrando que é para passar a melhor condição (ex.: "Te passo sim! 😊 Pra eu te passar a melhor condição, qual seu nome e de qual cidade você fala?"). Pode mandar a foto do produto enquanto isso.`,
      `- Se o cliente pedir o preço de novo sem responder, não trave a conversa: passe o preço e continue pedindo o que falta.`,
      `- Assim que souber, passe o preço e as condições completas; as outras perguntas podem vir depois, junto com a conversa.`
    );
  } else {
    lines.push(`- Responda o que o cliente perguntou (inclusive o preço) e, na mesma mensagem, peça um dado que falta.`);
  }
  return `\n\nQUALIFICAÇÃO DO LEAD\n${lines.join("\n")}`;
}
