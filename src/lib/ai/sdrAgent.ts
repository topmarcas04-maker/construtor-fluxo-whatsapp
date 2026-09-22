/**
 * SDR com IA — monta o pedido para o Claude (API da Anthropic) e interpreta a resposta.
 *
 * A IA sempre responde chamando a ferramenta "registrar_atendimento", que traz:
 *  - a mensagem para enviar ao cliente no WhatsApp
 *  - os dados de qualificação (nome, cidade, interesse, tipo de compra, nota…)
 *  - se deve transferir para um vendedor
 *
 * Sem dependências (usa fetch) para rodar tanto no motor (tsx) quanto no Next.
 * Não use imports com "@/": este arquivo é importado pelo motor via caminho relativo.
 */

export interface AgentHistoryMessage {
  direction: "IN" | "OUT";
  body: string;
  sender?: string | null;
}

export interface AgentLeadContext {
  name: string | null;
  city: string | null;
  interest: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  stage: string;
  score: number | null;
  summary: string | null;
}

export interface AgentInput {
  systemPrompt: string;
  lead: AgentLeadContext;
  history: AgentHistoryMessage[];
  tags: string[];
  regions: string[];
  now?: Date;
}

export interface AgentDecision {
  reply: string;
  name: string | null;
  city: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  interest: string | null;
  stage: "FIRST_CONTACT" | "SECOND_CONTACT" | "HOT_LEAD";
  score: number;
  summary: string;
  tags: string[];
  handoff: boolean;
  handoffReason: string | null;
}

export const TOOL_NAME = "registrar_atendimento";

const TOOL = {
  name: TOOL_NAME,
  description:
    "Registra o atendimento: a mensagem a enviar agora para o cliente no WhatsApp e a qualificação atualizada do lead. Use SEMPRE.",
  input_schema: {
    type: "object",
    properties: {
      resposta: {
        type: "string",
        description:
          "Texto exato a enviar agora ao cliente pelo WhatsApp. Curto e natural (1 a 3 frases). Pode separar em até 3 mensagens com uma linha em branco. Deixe vazio só se for transferir e não precisar dizer mais nada.",
      },
      nome: { type: "string", description: "Nome do cliente, se ele informou. Vazio se não sabe." },
      cidade: { type: "string", description: "Cidade/bairro do cliente, se informou. Vazio se não sabe." },
      tipo_compra: {
        type: "string",
        enum: ["VAREJO", "ATACADO", "INDEFINIDO"],
        description: "VAREJO = uso próprio; ATACADO = revenda/quantidade.",
      },
      interesse: {
        type: "string",
        description: "O que o cliente procura (modelo, uso, orçamento, quantidade). Vazio se ainda não sabe.",
      },
      estagio: {
        type: "string",
        enum: ["PRIMEIRO_CONTATO", "SEGUNDO_CONTATO", "LEAD_QUENTE"],
        description:
          "PRIMEIRO_CONTATO = começou agora; SEGUNDO_CONTATO = conversa em andamento, dando informações; LEAD_QUENTE = quer preço/condição/comprar.",
      },
      pontuacao: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "Nota de qualificação: 0-30 só curiosidade; 31-60 interessado; 61-80 quente (pede preço/condições); 81-100 pronto para comprar.",
      },
      resumo: {
        type: "string",
        description: "Resumo para o vendedor em 1 a 3 frases: quem é, o que quer, objeções, próximos passos.",
      },
      etiquetas: {
        type: "array",
        items: { type: "string" },
        description: "Etiquetas que se aplicam, escolhidas SOMENTE da lista de etiquetas disponíveis.",
      },
      transferir: {
        type: "boolean",
        description:
          "true para passar agora para um vendedor humano (pronto para comprar, pediu preço/orçamento que você não pode dar, pediu atendente, atacado, reclamação, ou você não sabe responder).",
      },
      motivo_transferencia: { type: "string", description: "Por que transferir (se transferir=true)." },
    },
    required: ["resposta", "tipo_compra", "estagio", "pontuacao", "resumo", "transferir"],
  },
} as const;

const SALE_TYPE_TO_PT: Record<string, string> = { ANY: "não definido", WHOLESALE: "atacado", RETAIL: "varejo" };

export function buildSystemPrompt(input: AgentInput) {
  const now = input.now || new Date();
  const when = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
  const l = input.lead;
  const known = [
    l.name ? `nome: ${l.name}` : null,
    l.city ? `cidade: ${l.city}` : null,
    l.interest ? `interesse: ${l.interest}` : null,
    l.saleType !== "ANY" ? `tipo de compra: ${SALE_TYPE_TO_PT[l.saleType]}` : null,
    l.summary ? `resumo anterior: ${l.summary}` : null,
  ].filter(Boolean);

  return `${input.systemPrompt.trim()}

---
INFORMAÇÕES INTERNAS (nunca mostre ao cliente)
- Agora: ${when} (horário de Brasília)
- O que já sabemos do lead: ${known.length ? known.join("; ") : "nada ainda"}
- Etiquetas disponíveis: ${input.tags.length ? input.tags.join(", ") : "(nenhuma)"}
- Regiões com vendedor dedicado: ${input.regions.length ? input.regions.join(", ") : "(todas as regiões)"}

REGRAS DE FORMATO
- Responda SEMPRE chamando a ferramenta ${TOOL_NAME}.
- "resposta" é enviada como está no WhatsApp: português do Brasil, sem markdown (#, **, listas longas), no máximo um emoji.
- Não repita perguntas que o cliente já respondeu. Faça no máximo uma pergunta por vez.
- Nunca invente preço, estoque, prazo ou condição que não esteja nas instruções acima.
- Se o cliente mandar áudio ou imagem que você não consegue ver, peça gentilmente para escrever.
- Mantenha os dados de qualificação atualizados em todas as respostas (repita o que já sabe).`;
}

/** Converte o histórico para o formato de mensagens da API (alternando user/assistant) */
export function buildMessages(history: AgentHistoryMessage[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    const role = m.direction === "IN" ? "user" : "assistant";
    const text = (m.body || "").trim() || "[mensagem sem texto]";
    const labeled = role === "assistant" && m.sender === "HUMAN" ? `[vendedor da equipe] ${text}` : text;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${labeled}`;
    else out.push({ role, content: labeled });
  }
  // A conversa precisa começar com o cliente
  while (out.length && out[0].role === "assistant") out.shift();
  return out;
}

const STAGE_MAP: Record<string, AgentDecision["stage"]> = {
  PRIMEIRO_CONTATO: "FIRST_CONTACT",
  SEGUNDO_CONTATO: "SECOND_CONTACT",
  LEAD_QUENTE: "HOT_LEAD",
};
const SALE_MAP: Record<string, AgentDecision["saleType"]> = {
  VAREJO: "RETAIL",
  ATACADO: "WHOLESALE",
  INDEFINIDO: "ANY",
};

function clean(v: unknown, max = 255) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/** Interpreta o "input" da ferramenta devolvido pelo Claude */
export function parseDecision(raw: Record<string, unknown>, allowedTags: string[]): AgentDecision {
  const score = Math.round(Number(raw.pontuacao));
  const allowed = new Map(allowedTags.map((t) => [t.toLowerCase(), t]));
  const tags = Array.isArray(raw.etiquetas)
    ? raw.etiquetas
        .map((t) => allowed.get(String(t).trim().toLowerCase()))
        .filter((t): t is string => Boolean(t))
    : [];
  return {
    reply: typeof raw.resposta === "string" ? raw.resposta.trim() : "",
    name: clean(raw.nome, 200),
    city: clean(raw.cidade, 120),
    saleType: SALE_MAP[String(raw.tipo_compra)] || "ANY",
    interest: clean(raw.interesse),
    stage: STAGE_MAP[String(raw.estagio)] || "SECOND_CONTACT",
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    summary: clean(raw.resumo, 1000) || "",
    tags,
    handoff: raw.transferir === true,
    handoffReason: clean(raw.motivo_transferencia, 500),
  };
}

/** Chama a API da Anthropic. Lança erro com mensagem legível em caso de falha. */
export async function runSdrAgent(
  input: AgentInput,
  opts: { apiKey: string; model: string; timeoutMs?: number; baseUrl?: string }
): Promise<AgentDecision | null> {
  const messages = buildMessages(input.history);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") return null;

  const base = (opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      system: buildSystemPrompt(input),
      messages,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    content?: { type: string; name?: string; input?: Record<string, unknown> }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`API da IA respondeu ${res.status}: ${data?.error?.message || "erro desconhecido"}`);
  }
  const toolUse = data.content?.find((c) => c.type === "tool_use" && c.name === TOOL_NAME);
  if (!toolUse?.input) throw new Error("A IA não devolveu o atendimento no formato esperado");
  return parseDecision(toolUse.input, input.tags);
}

/** Normaliza texto para comparar cidades (sem acento, minúsculo) */
export function normalizeText(s: string | null | undefined) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface RuleLike {
  region: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  priority: number;
  active: boolean;
  sellerId: string;
  sellerActive: boolean;
}

/**
 * Escolhe o vendedor pelas regras de distribuição:
 * região bate (ou regra sem região) + tipo bate (ou regra "qualquer tipo").
 * Regras com região específica ganham das genéricas; depois vale a prioridade.
 */
export function pickSeller(rules: RuleLike[], city: string | null, saleType: RuleLike["saleType"]) {
  const c = normalizeText(city);
  const candidates = rules
    .filter((r) => r.active && r.sellerActive)
    .filter((r) => r.saleType === "ANY" || r.saleType === saleType)
    .filter((r) => {
      if (!r.region) return true;
      const reg = normalizeText(r.region);
      return Boolean(c) && (c.includes(reg) || reg.includes(c));
    })
    .sort((a, b) => {
      const specA = (a.region ? 2 : 0) + (a.saleType !== "ANY" ? 1 : 0);
      const specB = (b.region ? 2 : 0) + (b.saleType !== "ANY" ? 1 : 0);
      if (specA !== specB) return specB - specA;
      return b.priority - a.priority;
    });
  return candidates[0]?.sellerId || null;
}
