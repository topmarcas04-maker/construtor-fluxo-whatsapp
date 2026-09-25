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

/** Campo criado pela própria empresa (master ou parceiro) para a IA perguntar */
export interface QualifyCustomField {
  /** Identificador interno ("c_" + letras/números) */
  key: string;
  /** Nome que aparece no painel (ex.: "CNH") */
  label: string;
  /** Como a IA deve perguntar (ex.: "se já tem CNH") */
  ask: string;
}

export interface QualifySettings {
  mode: QualifyMode;
  fields: string[];
  /** Outras perguntas escritas pela empresa */
  custom: string;
  /** Campos extras criados pela empresa (entram na lista de "O que perguntar") */
  customFields: QualifyCustomField[];
  /** Campos que precisam estar preenchidos para passar o lead ao vendedor */
  required: string[];
  /** Passa o lead para o próximo vendedor da fila assim que os campos obrigatórios chegam */
  autoHandoff: boolean;
  /**
   * Na transferência automática: ANSWER = a IA ainda responde (pode passar preço) e transfere;
   * ONLY_HANDOFF = só transfere, sem preço — e no modo "Antes de informar" o preço nunca é liberado pela IA.
   */
  handoffReply: "ANSWER" | "ONLY_HANDOFF";
}

export const DEFAULT_QUALIFY: QualifySettings = {
  mode: "OFF",
  fields: ["name", "city"],
  custom: "",
  customFields: [],
  required: [],
  autoHandoff: false,
  handoffReply: "ANSWER",
};

export const MAX_CUSTOM_FIELDS = 12;

/** Campos que vão para colunas próprias do lead (os outros ficam em leads.qualify_data) */
export const COLUMN_FIELD_KEYS = ["name", "city"];

function normalizeCustomFields(v: unknown): QualifyCustomField[] {
  if (!Array.isArray(v)) return [];
  const out: QualifyCustomField[] = [];
  for (const raw of v) {
    const o = (raw && typeof raw === "object" ? raw : {}) as Partial<QualifyCustomField>;
    const key = typeof o.key === "string" && /^c_[a-z0-9]{3,16}$/.test(o.key) ? o.key : null;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const ask = typeof o.ask === "string" ? o.ask.trim().slice(0, 200) : "";
    if (!key || !label || out.some((f) => f.key === key)) continue;
    out.push({ key, label, ask: ask || label.toLowerCase() });
    if (out.length >= MAX_CUSTOM_FIELDS) break;
  }
  return out;
}

/** Todos os campos disponíveis para esta conta: os padrão + os criados pela empresa */
export function allQualifyFields(q: Pick<QualifySettings, "customFields">): { key: string; label: string; ask: string; custom: boolean }[] {
  return [
    ...QUALIFY_FIELDS.map((f) => ({ key: f.key as string, label: f.label as string, ask: f.ask as string, custom: false })),
    ...(q.customFields || []).map((f) => ({ ...f, custom: true })),
  ];
}

/** Campos marcados que a IA preenche em "dados" (nome e cidade têm campo próprio) */
export function qualifyDataFields(q: QualifySettings) {
  if (q.mode === "OFF") return [];
  return allQualifyFields(q).filter((f) => q.fields.includes(f.key) && !COLUMN_FIELD_KEYS.includes(f.key));
}

export function normalizeQualify(v: unknown): QualifySettings {
  const o = (v && typeof v === "object" ? v : {}) as Partial<QualifySettings>;
  const mode = QUALIFY_MODES.some((m) => m.key === o.mode) ? (o.mode as QualifyMode) : DEFAULT_QUALIFY.mode;
  const customFields = normalizeCustomFields(o.customFields);
  const known = allQualifyFields({ customFields }).map((f) => f.key);
  const fields = Array.isArray(o.fields) ? known.filter((k) => (o.fields as unknown[]).includes(k)) : DEFAULT_QUALIFY.fields;
  const required = Array.isArray(o.required) ? fields.filter((k) => (o.required as unknown[]).includes(k)) : [];
  return {
    mode,
    fields,
    custom: typeof o.custom === "string" ? o.custom.slice(0, 1000) : "",
    customFields,
    required,
    autoHandoff: o.autoHandoff === true,
    handoffReply: o.handoffReply === "ONLY_HANDOFF" ? "ONLY_HANDOFF" : "ANSWER",
  };
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
  // "Só transferir": o preço fica com o consultor, a IA não libera nem se o cliente insistir
  const neverRelease = onlyHandoff(q);
  return q.mode === "BEFORE_PRICE" && qualifyEssentials(q).length > 0 && !s.qualifiedAt && (neverRelease || s.leadMessages < QUALIFY_RELEASE_AFTER);
}

/** Transferência automática no modo "só transferir, sem passar valor" */
export function onlyHandoff(q: QualifySettings) {
  return q.mode !== "OFF" && q.autoHandoff && q.required.length > 0 && q.handoffReply === "ONLY_HANDOFF";
}

/**
 * O cliente já informou os dados principais? O nome só vale se aparece no que o cliente escreveu
 * (o nome do perfil do WhatsApp não conta).
 */
export function isQualified(q: QualifySettings, d: { name?: string | null; city?: string | null }, leadTexts: string[], knownCity?: string | null) {
  return qualifyEssentials(q).every((k) => {
    if (k === "name") return nameSaidByLead(d.name, leadTexts);
    if (k === "city") return Boolean((d.city || knownCity || "").trim());
    return true;
  });
}

/** O nome só vale se o cliente escreveu (o nome do perfil do WhatsApp não conta) */
function nameSaidByLead(name: string | null | undefined, leadTexts: string[]) {
  const said = norm(leadTexts.join(" \n "));
  const first = norm((name || "").trim().split(/\s+/)[0] || "");
  return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first.replace(/[^a-z0-9]/g, "")}([^a-z0-9]|$)`).test(said);
}

/** Valores coletados de cada campo (fora nome e cidade), com o nome do campo para mostrar no painel */
export type QualifyData = Record<string, { label: string; value: string }>;

/**
 * Transferência automática: quais campos obrigatórios ainda faltam?
 * Lista vazia = pode passar para o vendedor. Sem obrigatórios ou desligado = null (não transfere sozinho).
 */
export function missingForHandoff(
  q: QualifySettings,
  s: { name?: string | null; city?: string | null; data?: QualifyData | null; leadTexts: string[] }
): string[] | null {
  if (q.mode === "OFF" || !q.autoHandoff || !q.required.length) return null;
  return q.required.filter((k) => {
    if (k === "name") return !nameSaidByLead(s.name, s.leadTexts);
    if (k === "city") return !(s.city || "").trim();
    return !(s.data?.[k]?.value || "").trim();
  });
}

/** Junta os dados novos que a IA extraiu com os que o lead já tinha (só campos marcados) */
export function mergeQualifyData(q: QualifySettings, current: QualifyData | null | undefined, incoming: Record<string, string> | null | undefined): QualifyData {
  const out: QualifyData = { ...(current || {}) };
  for (const f of qualifyDataFields(q)) {
    const v = (incoming?.[f.key] || "").trim();
    if (v) out[f.key] = { label: f.label, value: v.slice(0, 300) };
    else if (out[f.key]) out[f.key] = { ...out[f.key], label: f.label };
  }
  return out;
}

/** Item do catálogo sem preço, parcelas nem especificações (enquanto o lead não foi qualificado) */
export function maskCatalogItem<T extends { price: string; description: string | null; installments?: string[]; details?: string[]; hasVideo?: boolean; hasPhoto: boolean; photoLabels?: string[] }>(
  item: T
): T {
  return { ...item, price: "(liberado depois que souber os dados do cliente)", description: null, installments: [], details: [], hasVideo: false, hasPhoto: false, photoLabels: [] };
}

/** Bloco do prompt da IA */
export function qualifyBlock(
  q: QualifySettings | undefined,
  known: { name?: string | null; city?: string | null; data?: QualifyData | null },
  pending = false
) {
  if (!q || q.mode === "OFF") return "";
  // O nome que vem do perfil do WhatsApp pode ser apelido, empresa ou emoji: a IA confere na conversa.
  // A cidade só é preenchida quando o cliente informa, então essa é confiável.
  const missing = allQualifyFields(q)
    .filter((f) => q.fields.includes(f.key))
    .filter((f) => !(f.key === "city" && known.city))
    .filter((f) => !(known.data?.[f.key]?.value || "").trim());
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
      onlyHandoff(q)
        ? `- Na primeira resposta: cumprimente, mostre que entendeu qual produto ele quer (uma frase curta, sem detalhes técnicos) e peça ${need}, dizendo que é para um consultor passar a melhor condição pra ele. Ex.: "Oi! Que bom que gostou da FX2 😊 Pra um consultor te passar a melhor condição, qual seu nome e de qual cidade você fala?". NÃO mande foto nem vídeo ainda.`
        : `- Na primeira resposta: cumprimente, mostre que entendeu qual produto ele quer (uma frase curta, sem detalhes técnicos) e peça ${need}, dizendo que é para passar as informações e a melhor condição pra ele. Ex.: "Oi! Que bom que gostou da FX2 😊 Já te passo tudo! Qual seu nome e de qual cidade você fala?". NÃO mande foto nem vídeo ainda.`,
      onlyHandoff(q)
        ? `- Se o cliente pedir o preço de novo sem responder, NÃO passe valores: explique com simpatia que o consultor passa valores e condições assim que ele informar ${need}.`
        : `- Se o cliente pedir as informações ou o preço de novo sem responder, não trave a conversa: passe o que ele pediu e continue pedindo o que falta.`,
      onlyHandoff(q)
        ? `- Depois que souber: o atendimento passa para o consultor, que envia valores e condições.`
        : `- Depois que souber: responda SOMENTE o que o cliente pediu, de forma curta (ex.: pediu "mais informações" → 2 ou 3 destaques principais; pediu preço → o preço e as parcelas). Não despeje ficha técnica, preço, parcelas e fotos de uma vez.`,
      `- Fotos e vídeo: envie só quando o cliente pedir para ver ou quando ele escolher um modelo/cor. Pode oferecer ("quer que eu te mande a foto?").`,
      `- As outras perguntas podem vir depois, junto com a conversa.`
    );
  } else {
    lines.push(`- Responda o que o cliente perguntou (inclusive o preço) e, na mesma mensagem, peça um dado que falta.`);
  }
  if (pending)
    lines.push(
      `- AGORA: preço, parcelas, especificações e fotos estão ocultos no catálogo até você saber ${qualifyEssentials(q)
        .map((k) => QUALIFY_FIELDS.find((f) => f.key === k)!.ask)
        .join(" e ")}. ${onlyHandoff(q) ? "Não diga que não sabe o preço: diga que um consultor vai passar valores e condições" : "Não diga que não sabe o preço: diga que já vai passar tudo"} e peça esses dados. Preencha "nome" somente com o nome que o cliente escreveu.`
    );
  const dataFields = qualifyDataFields(q);
  if (dataFields.length)
    lines.push(
      `- Sempre que o cliente informar algum destes dados, preencha em "dados" (repita os que já sabe): ${dataFields.map((f) => `${f.key} = ${f.label}`).join("; ")}.`
    );
  if (q.autoHandoff && q.required.length) {
    const req = allQualifyFields(q).filter((f) => q.required.includes(f.key));
    lines.push(
      `- Assim que o cliente informar ${req.map((f) => f.ask).join(", ")}, o atendimento passa automaticamente para um consultor. Priorize conseguir esses dados, sem pressionar.`
    );
    if (onlyHandoff(q)) lines.push(`- NUNCA informe preço, valores, parcelas ou promoções: quem passa isso é o consultor.`);
  }
  return `\n\nQUALIFICAÇÃO DO LEAD\n${lines.join("\n")}`;
}
