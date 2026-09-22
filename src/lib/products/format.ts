/** Texto do preço mostrado no card e usado pela IA */
export function priceLabel(p: { price: number | null; promoPrice: number | null }) {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (p.promoPrice != null && p.price != null) return `de ${brl(p.price)} por ${brl(p.promoPrice)}`;
  if (p.promoPrice != null) return brl(p.promoPrice);
  if (p.price != null) return brl(p.price);
  return "Preço sob consulta";
}
