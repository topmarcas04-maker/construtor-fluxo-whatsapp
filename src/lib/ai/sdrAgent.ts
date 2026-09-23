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
  /** Canal da conversa: WHATSAPP (padrão), INSTAGRAM ou MESSENGER */
  channel?: string;
  /** Agenda: a IA pode marcar horários */
  scheduling?: {
    enabled: boolean;
    businessHours: string | null;
    /** Horários já ocupados nos próximos dias (texto, ex.: "25/09 às 14:00") */
    busy: string[];
    /** Agendamento futuro que este lead já tem (texto) */
    current: string | null;
  };
  /** Ações (procedimentos) que a IA pode conduzir */
  actions?: { name: string; kind: string; instructions: string | null }[];
  /** Colunas do funil com regra: a IA coloca o lead nelas quando a regra se aplica */
  columns?: { name: string; rule: string }[];
  /** Catálogo de produtos que a IA pode consultar (código curto P1, P2...) */
  catalog?: {
    code: string;
    name: string;
    category: string | null;
    price: string;
    description: string | null;
    hasPhoto: boolean;
    /** Nomes das fotos (ex.: cores) */
    photoLabels?: string[];
    /** "Pronta entrega" ou "Pedido/reserva: entrega em até 15 dias" */
    delivery?: string;
    /** "12x de R$ 1.249,17 (total R$ 14.990,00)" */
    installments?: string[];
    /** Cores ativas com a entrega de cada uma */
    colors?: { name: string; delivery: string }[];
    /** "Produto" | "Plano / mensalidade" | "Serviço" */
    kind?: string;
    /** Adesão, fidelidade, teste grátis, duração */
    details?: string[];
    /** Ações permitidas (a primeira é a principal) */
    actions?: string[];
  }[];
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
  /** Horário combinado com o cliente (horário de Brasília) */
  appointment: { date: string; time: string; subject: string } | null;
  /** WhatsApp informado pelo cliente (só números) */
  phone: string | null;
  /** Fotos a enviar: código do catálogo (P1, P2...) e, se houver, o nome da foto (ex.: a cor) */
  productCodes: { code: string; label: string | null }[];
  /** Ação concluída/aceita pelo cliente (nome exato) */
  actionName: string | null;
  /** Código do catálogo (P1, P2...) do produto que o cliente quer */
  interestCode: string | null;
  /** Nome da coluna do funil (com regra) para onde mover o lead */
  columnName: string | null;
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
      telefone: { type: "string", description: "Número de WhatsApp/telefone que o cliente informou na conversa (com DDD). Vazio se não informou." },
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
      agendamento: {
        type: "object",
        description:
          "Preencha SOMENTE quando o cliente CONFIRMOU um dia e horário (visita, test-drive, ligação, reunião). Omita se ainda está combinando.",
        properties: {
          data: { type: "string", description: "Data no formato AAAA-MM-DD" },
          hora: { type: "string", description: "Hora no formato HH:MM (24h, horário de Brasília)" },
          assunto: { type: "string", description: "Assunto curto, ex.: Visita à loja, Test-drive, Ligação" },
        },
        required: ["data", "hora", "assunto"],
      },
      executar_acao: {
        type: "string",
        description:
          "Nome EXATO de uma ação da lista AÇÕES quando o cliente ACEITOU ou CONCLUIU essa ação agora (confirmou horário, a reserva, a ligação, quis o financiamento etc.). Omita se não for o caso.",
      },
      produto_interesse: {
        type: "string",
        description:
          "Código do CATÁLOGO (ex.: P3) do produto/plano/serviço em que o cliente está interessado agora. Omita se ainda não está claro.",
      },
      mover_para_coluna: {
        type: "string",
        description:
          "Nome EXATO de uma coluna da lista COLUNAS DO FUNIL quando a regra dela se aplica a este cliente. Omita se nenhuma se aplica.",
      },
      enviar_fotos: {
        type: "array",
        items: { type: "string" },
        maxItems: 3,
        description:
          "Fotos do CATÁLOGO para enviar junto com a resposta, quando o cliente pedir para ver ou quando ajudar a vender. Use o código (ex.: P3) ou código/foto para uma foto específica, como uma cor (ex.: P3/Azul). Máximo 3. Omita se não houver catálogo ou não for o caso.",
      },
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
- "resposta" é enviada como está no ${channelName(input.channel)}: português do Brasil, sem markdown (#, **, listas longas), no máximo um emoji.
- Não repita perguntas que o cliente já respondeu. Faça no máximo uma pergunta por vez.
- Nunca invente preço, estoque, prazo ou condição que não esteja nas instruções ou no catálogo.
- Se o cliente mandar áudio ou imagem que você não consegue ver, peça gentilmente para escrever.
- Mantenha os dados de qualificação atualizados em todas as respostas (repita o que já sabe).${channelBlock(input)}${schedulingBlock(input)}${actionsBlock(input)}${columnsBlock(input)}${catalogBlock(input)}`;
}

function channelName(channel?: string) {
  return channel === "INSTAGRAM" ? "Direct do Instagram" : channel === "MESSENGER" ? "Messenger do Facebook" : "WhatsApp";
}

function channelBlock(input: AgentInput) {
  if (!input.channel || input.channel === "WHATSAPP") return "";
  return `

CANAL: ${channelName(input.channel)}
- Esta conversa é pelo ${channelName(input.channel)}, não pelo WhatsApp.
- Quando o cliente quiser comprar, agendar ou falar com um vendedor, peça gentilmente o número de WhatsApp dele para continuar o atendimento (os lembretes e o vendedor falam por lá).`;
}

function schedulingBlock(input: AgentInput) {
  const sc = input.scheduling;
  if (!sc?.enabled) {
    return "\n- Você NÃO marca horários. Se o cliente quiser agendar, diga que um consultor vai combinar com ele e transfira.";
  }
  return `

AGENDA
- Você pode marcar visita, test-drive, ligação ou reunião. Ofereça horários, confirme dia e hora com o cliente e só então preencha "agendamento".
- Horário de atendimento: ${sc.businessHours?.trim() || "segunda a sexta, 9h às 18h; sábado, 9h às 12h"}. Não marque fora dele nem no passado.
- Horários já ocupados: ${sc.busy.length ? sc.busy.join(", ") : "nenhum"}.
- ${sc.current ? `Este cliente já tem agendado: ${sc.current}. Se ele quiser remarcar, preencha "agendamento" com o novo horário.` : "Este cliente ainda não tem nada agendado."}
- Ao confirmar, repita dia e hora na resposta (ex.: "Combinado, quinta 25/09 às 14h!").`;
}

const KIND_TAG: Record<string, string> = {
  SCHEDULE: "agenda",
  CALL: "ligação",
  RESERVE: "reserva",
  HANDOFF: "passar para vendedor",
  INFO: "explicar",
};

function actionsBlock(input: AgentInput) {
  const list = input.actions || [];
  if (!list.length) return "";
  return `

AÇÕES (procedimentos da empresa)
${list.map((a) => `- "${a.name}" [${KIND_TAG[a.kind] || "explicar"}]${a.instructions ? `: ${a.instructions}` : ""}`).join("\n")}
- Cada item do catálogo lista as "ações" dele. Quando o cliente se interessar por um item, conduza a conversa pelas ações daquele item, oferecendo primeiro a principal. Não ofereça ações que o item não tem (exceto passar para um vendedor, se o cliente pedir).
- Itens sem ações seguem as instruções gerais.
- Ações de agenda: combine dia e horário e preencha "agendamento" (assunto = nome da ação).
- Quando o cliente ACEITAR ou CONCLUIR uma ação, preencha "executar_acao" com o nome exato dela.`;
}

function columnsBlock(input: AgentInput) {
  const cols = input.columns || [];
  if (!cols.length) return "";
  return `

COLUNAS DO FUNIL (preencha "mover_para_coluna" quando a regra se aplicar)
${cols.map((c) => `- "${c.name}": ${c.rule}`).join("\n")}`;
}

function catalogBlock(input: AgentInput) {
  const items = input.catalog || [];
  if (!items.length) return "";
  const lines = items.map((p) => {
    const parts = [`${p.code} | ${p.name}`];
    if (p.kind && p.kind !== "Produto") parts.push(`tipo: ${p.kind}`);
    if (p.category) parts.push(`categoria: ${p.category}`);
    parts.push(`preço: ${p.price}`);
    if (p.description) parts.push(`detalhes: ${p.description}`);
    if (p.details?.length) parts.push(p.details.join("; "));
    if (p.actions?.length) parts.push(`ações: ${p.actions.map((a, i) => (i === 0 ? `${a} (principal)` : a)).join(", ")}`);
    if (p.installments?.length) parts.push(`cartão: ${p.installments.join("; ")}`);
    if (p.delivery) parts.push(`entrega: ${p.delivery}`);
    if (p.colors?.length) {
      const sameDelivery = p.colors.every((c) => c.delivery === p.delivery);
      parts.push(
        `cores disponíveis: ${p.colors.map((c) => (sameDelivery ? c.name : `${c.name} (${c.delivery})`)).join(", ")}`
      );
    }
    if (!p.hasPhoto) parts.push("(sem foto)");
    else if (p.photoLabels?.length) parts.push(`fotos: ${p.photoLabels.join(", ")}`);
    return `- ${parts.join(" | ")}`;
  });
  return `

CATÁLOGO DE PRODUTOS (use SOMENTE estes dados para preço e informações)
${lines.join("\n")}
- Quando o cliente perguntar por um produto, preço ou detalhes, responda com base no catálogo acima. Os preços do catálogo PODEM ser informados ao cliente.
- Se o produto tiver "de X por Y", informe a promoção. O preço do catálogo é o valor à vista.
- Planos/mensalidades: o preço é por mês (ou por ano, se indicado). Informe adesão, fidelidade e teste grátis quando fizer sentido. Nunca fale "à vista" para planos.
- Serviços: "Sob orçamento" significa que um consultor passa o valor; informe a duração se o cliente perguntar.
- Sempre que o cliente mostrar interesse em um item do catálogo, preencha "produto_interesse" com o código dele e concentre a conversa nesse item.
- Parcelamento: informe as opções de "cartão" exatamente como estão (quantidade de parcelas e valor de cada uma). Não calcule outras opções.
- Entrega: se o produto ou a cor for "Pedido/reserva", SEMPRE avise o prazo de entrega ao falar dele (ex.: "essa é sob reserva, entrega em até 15 dias"). Se for "Pronta entrega", pode destacar isso.
- Só ofereça as cores listadas em "cores disponíveis". Se o cliente pedir outra cor, diga que no momento não tem e mostre as disponíveis.
- Para mostrar fotos, coloque o código (ex.: P3) em "enviar_fotos" — as fotos vão logo depois da sua resposta; não escreva links.
- Se o cliente pedir uma cor ou versão que tem foto com nome (ex.: "fotos: Preta, Azul"), use código/nome (ex.: P3/Azul) para mandar a foto certa. Se a cor pedida não existir, diga quais cores tem.
- Se o cliente pedir algo que não está no catálogo, diga que vai verificar com um consultor. Nunca invente produto ou preço.
- Não mostre os códigos (P1, P2...) ao cliente.`;
}

/** Converte o histórico para o formato de mensagens da API (alternando user/assistant) */
export function buildMessages(history: AgentHistoryMessage[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    const role = m.direction === "IN" ? "user" : "assistant";
    const text = (m.body || "").trim() || "[mensagem sem texto]";
    const labeled =
      role === "assistant" && m.sender === "HUMAN"
        ? `[vendedor da equipe] ${text}`
        : role === "assistant" && m.sender === "BOT"
        ? `[menu automático] ${text}`
        : text;
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
    appointment: parseAppointment(raw.agendamento),
    phone: parsePhone(raw.telefone),
    columnName: clean(raw.mover_para_coluna, 80),
    actionName: clean(raw.executar_acao, 80),
    interestCode: /^p\d{1,4}$/i.test(String(raw.produto_interesse || "").trim())
      ? String(raw.produto_interesse).trim().toUpperCase()
      : null,
    productCodes: parsePhotoRefs(raw.enviar_fotos),
  };
}

function parsePhone(v: unknown) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) return null;
  return d.length <= 11 ? `55${d}` : d;
}

/** "P3" ou "P3/Azul" → { code: "P3", label: "Azul" } (sem repetir, máx. 3) */
function parsePhotoRefs(v: unknown): AgentDecision["productCodes"] {
  if (!Array.isArray(v)) return [];
  const out: AgentDecision["productCodes"] = [];
  for (const item of v) {
    const m = /^\s*(p\d{1,4})\s*(?:[\/:\-–]\s*(.+?))?\s*$/i.exec(String(item));
    if (!m) continue;
    const ref = { code: m[1].toUpperCase(), label: m[2]?.trim().slice(0, 60) || null };
    if (!out.some((o) => o.code === ref.code && (o.label || "").toLowerCase() === (ref.label || "").toLowerCase())) out.push(ref);
    if (out.length >= 3) break;
  }
  return out;
}

function parseAppointment(v: unknown): AgentDecision["appointment"] {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const date = String(o.data || "").trim();
  const timeRaw = String(o.hora || "").trim().replace("h", ":").replace(/:$/, ":00");
  const time = /^\d{1,2}$/.test(timeRaw) ? `${timeRaw}:00` : timeRaw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  return { date, time: time.padStart(5, "0"), subject: clean(o.assunto, 200) || "Atendimento" };
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
