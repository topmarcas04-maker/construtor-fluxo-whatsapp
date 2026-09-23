/**
 * Estilo de conversa e ritmo da IA. Sem dependências (tela, site e motor).
 * O estilo é somado às instruções da empresa: dá para testar jeitos diferentes
 * de falar sem mexer nas informações (preços, lojas, regras).
 */

export const STYLE_PRESETS = [
  {
    key: "FRIENDLY",
    label: "Consultor amigável",
    hint: "Acolhedor, entende a necessidade antes de oferecer.",
    text: `Você é um consultor simpático e paciente. Primeiro entende o que o cliente precisa (uso, orçamento, cidade) e depois indica a melhor opção, explicando o porquê em poucas palavras. Soa como uma pessoa real da loja, não como robô.`,
  },
  {
    key: "DIRECT",
    label: "Direto ao ponto",
    hint: "Curto e objetivo, sem rodeios.",
    text: `Seja direto e objetivo, como um vendedor experiente no WhatsApp que respeita o tempo do cliente. Responda exatamente o que foi perguntado, em 1 ou 2 frases, e sugira o próximo passo. Nada de cumprimentos longos, elogios ou frases de efeito.`,
  },
  {
    key: "CASUAL",
    label: "Descontraído",
    hint: "Informal de WhatsApp, bem humano.",
    text: `Fale do jeito que as pessoas conversam no WhatsApp: informal, leve e natural ("show", "tranquilo", "bora", "fechou", "pode deixar"), sem exagerar nas gírias. Frases curtas. Pode brincar de leve quando o cliente abrir espaço. Nunca soe como atendimento de call center.`,
  },
  {
    key: "CLOSER",
    label: "Vendedor que fecha",
    hint: "Conduz para a venda, trata objeções.",
    text: `Você é um vendedor que conduz a conversa até o fechamento, sem ser insistente. Mostre o valor do produto ligado ao que o cliente falou (economia, praticidade, garantia). Trate objeções com calma: preço (mostre parcelamento e o que está incluso), frete, confiança (pagamento na entrega, garantia). Sempre proponha um próximo passo concreto (visitar a loja, reservar, test-drive, passar para o consultor). Só use urgência se for verdade (estoque, pronta entrega, promoção com prazo).`,
  },
  {
    key: "PREMIUM",
    label: "Formal / premium",
    hint: "Elegante, sem gírias e sem emojis.",
    text: `Atenda com tom cordial e elegante, como uma loja premium. Linguagem correta, sem gírias e sem emojis. Seja atencioso e preciso nas informações. Se o cliente tratar por "senhor/senhora", mantenha o mesmo tratamento.`,
  },
  { key: "CUSTOM", label: "Personalizado", hint: "Você escreve o estilo.", text: "" },
] as const;

export type StyleKey = (typeof STYLE_PRESETS)[number]["key"];

export const LENGTH_OPTIONS = [
  { key: "SHORT", label: "Curtas", text: "Respostas curtas: 1 a 2 frases. Só detalhe se o cliente pedir." },
  { key: "MEDIUM", label: "Médias", text: "Respostas de tamanho médio: até 3 frases, sem textão." },
  { key: "LONG", label: "Detalhadas", text: "Pode explicar com mais detalhes quando ajudar o cliente a decidir, mas sem listas longas." },
] as const;

export const EMOJI_OPTIONS = [
  { key: "NONE", label: "Nenhum", text: "Não use emojis." },
  { key: "LOW", label: "Poucos", text: "No máximo um emoji, e não em toda mensagem." },
  { key: "MANY", label: "À vontade", text: "Pode usar emojis com naturalidade (1 ou 2 por mensagem), sem exagero." },
] as const;

/** Tempo que a IA "leva" para responder (segundos, desde a mensagem do cliente) */
export const SPEED_OPTIONS = [
  { key: "FAST", label: "Imediato", hint: "Responde assim que termina de pensar (5 a 10 s).", min: 0, max: 0 },
  { key: "NATURAL", label: "Natural", hint: "Entre 15 e 40 segundos, mostrando \"digitando...\".", min: 15, max: 40 },
  { key: "CALM", label: "Calmo", hint: "Entre 40 e 90 segundos, como alguém que estava ocupado.", min: 40, max: 90 },
] as const;

export interface StyleSettings {
  style?: string | null;
  styleCustom?: string | null;
  replyLength?: string | null;
  emojiLevel?: string | null;
}

/** Bloco que vai no prompt da IA */
export function styleBlock(s: StyleSettings) {
  const preset = STYLE_PRESETS.find((p) => p.key === s.style) || STYLE_PRESETS[0];
  const styleText = preset.key === "CUSTOM" ? (s.styleCustom || "").trim() : preset.text;
  const length = LENGTH_OPTIONS.find((o) => o.key === s.replyLength) || LENGTH_OPTIONS[1];
  const emoji = EMOJI_OPTIONS.find((o) => o.key === s.emojiLevel) || EMOJI_OPTIONS[1];
  return `

ESTILO DE CONVERSA
${styleText ? `- ${styleText}\n` : ""}- ${length.text}
- ${emoji.text}
- Varie o jeito de escrever: não comece toda mensagem do mesmo jeito (ex.: "Oi", "Perfeito", "Ótimo", "Claro") e não use o nome do cliente em toda mensagem.
- Não termine toda mensagem com pergunta; às vezes só responda e deixe o cliente conduzir.
- Nunca repita frases ou explicações que você já mandou nesta conversa.
- Acompanhe o ritmo do cliente: mensagem curta dele, resposta curta sua.
- Se a resposta tiver duas ideias diferentes, separe-as com uma linha em branco (cada parte vira uma mensagem, como uma pessoa digitando).`;
}

/** Espera (ms) antes de responder, descontando o tempo que já passou */
export function replyDelayMs(speed: string | null | undefined, elapsedMs: number) {
  const o = SPEED_OPTIONS.find((x) => x.key === speed) || SPEED_OPTIONS[0];
  if (!o.max) return 0;
  const target = (o.min + Math.random() * (o.max - o.min)) * 1000;
  return Math.max(0, target - elapsedMs);
}

/** Pausa "digitando" entre uma mensagem e outra (ms) */
export function typingMs(speed: string | null | undefined, text: string) {
  if (!speed || speed === "FAST") return 1200;
  return Math.min(7000, 1500 + text.length * 35);
}
