/**
 * Roteador: o Agente Principal lê o começo da conversa e escolhe o agente certo da equipe.
 * Uma chamada curta de IA, só quando a conversa é nova. Sem imports "@/" (motor e site usam).
 */

export interface RouteCandidate {
  id: string;
  name: string;
  scope: string;
}

export async function routeWithAi(
  candidates: RouteCandidate[],
  clientMessages: string[],
  opts: { apiKey: string; model: string; baseUrl?: string; timeoutMs?: number }
): Promise<{ id: string; intent: string | null } | null> {
  const text = clientMessages
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");
  if (!text || candidates.length < 2) return null;
  const base = (opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const list = candidates.map((c) => `- ${c.name}: ${c.scope}`).join("\n");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 200,
      system: `Você é o recepcionista de uma empresa no WhatsApp. Leia o que o cliente escreveu e escolha QUAL agente da equipe deve atender. Se não der para saber, escolha o primeiro da lista.\n\nAgentes:\n${list}`,
      messages: [{ role: "user", content: `Mensagens do cliente:\n${text}` }],
      tools: [
        {
          name: "encaminhar",
          description: "Escolhe o agente que vai atender.",
          input_schema: {
            type: "object",
            properties: {
              agente: { type: "string", enum: candidates.map((c) => c.name) },
              intencao: { type: "string", description: "Em 2 a 5 palavras, o que o cliente quer (ex.: comprar scooter, revisão)." },
            },
            required: ["agente"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "encaminhar" },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
  });
  const data = (await res.json().catch(() => ({}))) as { content?: { type: string; input?: Record<string, unknown> }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Roteador: API respondeu ${res.status}: ${data?.error?.message || "erro"}`);
  const input = data.content?.find((c) => c.type === "tool_use")?.input;
  const name = typeof input?.agente === "string" ? input.agente.trim().toLowerCase() : "";
  const hit = candidates.find((c) => c.name.trim().toLowerCase() === name);
  if (!hit) return null;
  const intent = typeof input?.intencao === "string" ? input.intencao.trim().slice(0, 80) : null;
  return { id: hit.id, intent };
}
