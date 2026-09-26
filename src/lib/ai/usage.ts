/**
 * Consumo de IA: tokens de cada chamada e custo estimado. Sem imports "@/".
 * Preços em US$ por milhão de tokens (entrada / saída) — estimativa; o valor real está no painel da Anthropic.
 */
export interface Usage {
  input: number;
  output: number;
}

export function readUsage(data: unknown): Usage | null {
  const u = (data as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } })?.usage;
  if (!u) return null;
  return {
    input: Number(u.input_tokens || 0) + Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0),
    output: Number(u.output_tokens || 0),
  };
}

const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /haiku/i, input: 1, output: 5 },
  { match: /opus/i, input: 5, output: 25 },
  { match: /sonnet/i, input: 3, output: 15 },
];

/** Custo estimado em US$ */
export function usageCost(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICES.find((x) => x.match.test(model)) || PRICES[2];
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}
