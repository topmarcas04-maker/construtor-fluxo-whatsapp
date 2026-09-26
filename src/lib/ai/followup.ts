/**
 * IA escreve a mensagem de recontato olhando a conversa. Sem imports "@/" (usado pelo motor).
 */
import { readUsage, type Usage } from "./usage";

export interface FollowupAiInput {
  systemPrompt: string;
  instructions: string;
  leadName: string | null;
  attempt: number; // 1..total
  total: number;
  history: { direction: "IN" | "OUT"; body: string; sender?: string | null }[];
  /** Menu do chatbot que ficou sem resposta (as opções vão junto na mensagem) */
  pendingMenu?: string | null;
}

export async function generateFollowup(
  input: FollowupAiInput,
  opts: { apiKey: string; model: string; baseUrl?: string; timeoutMs?: number; onUsage?: (u: Usage) => void }
): Promise<string | null> {
  const convo = input.history
    .slice(-20)
    .map((m) => `${m.direction === "IN" ? "[Cliente]" : m.sender === "HUMAN" ? "[Vendedor]" : "[Empresa]"} ${m.body}`)
    .join("\n");
  const last = input.attempt === input.total;
  const system = [
    input.systemPrompt || "Você é a atendente virtual da empresa.",
    "",
    "# RECONTATO (o cliente parou de responder)",
    `Escreva UMA mensagem curta de WhatsApp (1 ou 2 frases) para retomar a conversa. Esta é a tentativa ${input.attempt} de ${input.total}.`,
    "- Tom leve e educado, sem pressão e sem parecer robô. Pode usar no máximo 1 emoji.",
    "- Retome o assunto da conversa (produto, dúvida, horário) quando fizer sentido.",
    "- NÃO invente preços, prazos, promoções ou condições que não estejam na conversa.",
    "- Não repita o texto de recontatos anteriores.",
    last ? "- É a última tentativa: diga com gentileza que fica à disposição caso precise." : "",
    input.pendingMenu ? "- O cliente não respondeu um menu de opções; convide-o a responder com o número da opção (as opções serão enviadas logo abaixo da sua mensagem)." : "",
    input.instructions ? `- Orientação da empresa: ${input.instructions}` : "",
    input.leadName ? `- Nome do cliente: ${input.leadName} (use só o primeiro nome).` : "",
    "Responda APENAS com o texto da mensagem, sem aspas.",
  ]
    .filter(Boolean)
    .join("\n");

  const base = (opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: `Conversa até agora:\n${convo || "(sem mensagens)"}\n\nEscreva a mensagem de recontato.` }],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`API da IA respondeu ${res.status}: ${data?.error?.message || "erro"}`);
  const usage = readUsage(data);
  if (usage && opts.onUsage) opts.onUsage(usage);
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("")
    .trim()
    .replace(/^["“]|["”]$/g, "");
  return text ? text.slice(0, 700) : null;
}
