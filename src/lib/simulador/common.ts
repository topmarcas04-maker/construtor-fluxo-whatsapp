/** Simulador de cartão — tipos, cálculo e validação. Seguro para o navegador. */

export const MAX_INSTALLMENTS = 21;

export interface CardMachine {
  id: string;
  name: string;
  color: string;
  /** Taxa do débito em % (vazio = a maquininha não faz débito) */
  debitRate: number | null;
  /** Taxas do crédito em %: posição 0 = à vista (1x) … posição 20 = 21x. Vazio = não parcela nessa quantidade */
  rates: (number | null)[];
  /** Conta dona da tabela */
  ownerName: string;
  /** true = tabela da própria conta (pode editar); false = tabela padrão herdada (só usar) */
  own: boolean;
}

/** RECEBER: digito quanto quero receber e o simulador diz quanto cobrar (taxa com o cliente).
 *  COBRAR: digito o valor da venda e o simulador diz quanto cai para mim (taxa comigo). */
export type SimMode = "RECEBER" | "COBRAR";

export interface SimRow {
  key: string;
  label: string;
  installments: number;
  rate: number;
  /** Valor passado na maquininha */
  charged: number;
  /** Valor de cada parcela */
  installment: number;
  /** Taxa em reais */
  fee: number;
  /** Quanto cai na conta */
  net: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function simulate(machine: Pick<CardMachine, "debitRate" | "rates">, value: number, mode: SimMode): SimRow[] {
  if (!(value > 0)) return [];
  const rows: { key: string; label: string; n: number; rate: number }[] = [];
  if (machine.debitRate != null) rows.push({ key: "debito", label: "Débito", n: 1, rate: machine.debitRate });
  machine.rates.slice(0, MAX_INSTALLMENTS).forEach((r, i) => {
    if (r == null) return;
    rows.push({ key: `c${i + 1}`, label: i === 0 ? "Crédito à vista" : `${i + 1}x`, n: i + 1, rate: r });
  });
  return rows
    .filter((r) => r.rate >= 0 && r.rate < 100)
    .map(({ key, label, n, rate }) => {
      const f = rate / 100;
      const charged = round2(mode === "RECEBER" ? value / (1 - f) : value);
      const net = round2(mode === "RECEBER" ? value : value * (1 - f));
      return { key, label, installments: n, rate, charged, installment: round2(charged / n), fee: round2(charged - net), net };
    });
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Texto pronto para mandar ao cliente (só o que ele precisa ver: parcelas e total) */
export function simulationText(machineName: string, rows: SimRow[], picked: string[]) {
  const list = picked.length ? rows.filter((r) => picked.includes(r.key)) : rows;
  const lines = list.map((r) =>
    r.key === "debito" || r.installments === 1
      ? `• ${r.label}: *${brl(r.charged)}*`
      : `• ${r.installments}x de *${brl(r.installment)}* (total ${brl(r.charged)})`
  );
  return [`*Opções de pagamento no cartão*`, ...lines].join("\n");
}

export const MACHINE_COLORS = ["#0f172a", "#155e75", "#1d4ed8", "#6d28d9", "#be123c", "#b45309", "#047857", "#334155"];

/** Validação do cadastro/edição de maquininha */
export function machineValues(body: unknown): { error: string } | { values: { name: string; color: string; debitRate: number | null; rates: (number | null)[] } } {
  const b = (body || {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return { error: "Dê um nome para a maquininha (ex.: Mastercard, Stone, PagSeguro)" };
  const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? String(b.color) : MACHINE_COLORS[0];
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const debitRate = num(b.debitRate);
  if (Number.isNaN(debitRate) || (debitRate != null && (debitRate < 0 || debitRate >= 100))) return { error: "Taxa do débito inválida" };
  const raw = Array.isArray(b.rates) ? b.rates.slice(0, MAX_INSTALLMENTS) : [];
  const rates: (number | null)[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = num(raw[i]);
    if (Number.isNaN(n) || (n != null && (n < 0 || n >= 100))) return { error: `Taxa de ${i === 0 ? "crédito à vista" : `${i + 1}x`} inválida` };
    rates.push(n);
  }
  while (rates.length && rates[rates.length - 1] == null) rates.pop();
  if (debitRate == null && rates.every((r) => r == null)) return { error: "Preencha ao menos uma taxa" };
  return { values: { name, color, debitRate, rates } };
}
