/** Textos do produto usados no card, nas mensagens e pela IA (sem dependências) */

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Texto do preço mostrado no card e usado pela IA */
export function priceLabel(p: { price: number | null; promoPrice: number | null }) {
  if (p.promoPrice != null && p.price != null) return `de ${brl(p.price)} por ${brl(p.promoPrice)}`;
  if (p.promoPrice != null) return brl(p.promoPrice);
  if (p.price != null) return brl(p.price);
  return "Preço sob consulta";
}

/** Preço à vista (promoção, se houver) */
export function cashPrice(p: { price: number | null; promoPrice: number | null }) {
  return p.promoPrice ?? p.price ?? null;
}

export interface Installment {
  n: number;
  /** Total a prazo; vazio = mesmo valor à vista (sem juros) */
  total: number | null;
}

/** Opções de parcelamento com o valor de cada parcela calculado */
export function installmentRows(p: { price: number | null; promoPrice: number | null; installments?: Installment[] | null }) {
  const base = cashPrice(p);
  return (p.installments || [])
    .filter((i) => i && i.n >= 2)
    .map((i) => {
      const total = i.total ?? base;
      return total == null ? null : { n: i.n, total, each: Math.round((total / i.n) * 100) / 100, noInterest: i.total == null || (base != null && Math.abs(total - base) < 0.01) };
    })
    .filter((r): r is { n: number; total: number; each: number; noInterest: boolean } => r !== null)
    .sort((a, b) => a.n - b.n);
}

/** "12x de R$ 1.249,17 (total R$ 14.990,00)" */
export function installmentText(r: { n: number; total: number; each: number; noInterest: boolean }) {
  return `${r.n}x de ${brl(r.each)}${r.noInterest ? " sem juros" : ` (total ${brl(r.total)})`}`;
}

export type Availability = "READY" | "ORDER";

/** Entrega efetiva de uma cor: a da cor, senão a do produto */
export function effectiveAvailability(
  product: { availability?: string | null; leadTimeDays?: number | null },
  color?: { availability?: string | null; leadTimeDays?: number | null } | null
) {
  const own = color?.availability === "READY" || color?.availability === "ORDER" ? color : null;
  const availability: Availability = (own?.availability || product.availability) === "ORDER" ? "ORDER" : "READY";
  const days = availability === "ORDER" ? (own ? own.leadTimeDays : product.leadTimeDays) ?? null : null;
  return { availability, days };
}

/** "Pronta entrega" | "Pedido/reserva: entrega em até 15 dias" */
export function availabilityText(a: { availability: Availability; days: number | null }) {
  if (a.availability === "READY") return "Pronta entrega";
  return a.days ? `Pedido/reserva: entrega em até ${a.days} dias` : "Pedido/reserva (prazo a confirmar)";
}
