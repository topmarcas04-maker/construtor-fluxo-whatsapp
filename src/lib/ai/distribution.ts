/**
 * Distribuição de leads entre vendedores: regras (cidade, tipo de compra, prioridade),
 * turnos de cada vendedor e rodízio entre quem empata. Sem dependências (motor e site).
 */
import { normalizeSellerHours, sellerAvailability, nextOpenAt } from "./hours";

export interface DistRule {
  region: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  priority: number;
  active: boolean;
  sellerId: string;
  sellerActive: boolean;
}

export interface RotationState {
  [poolKey: string]: { sellerId: string; count: number };
}

const normalize = (v: string | null | undefined) =>
  (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Vendedores empatados na melhor regra (mesma especificidade e prioridade), sem repetir */
export function sellerPool(rules: DistRule[], city: string | null, saleType: DistRule["saleType"]) {
  const c = normalize(city);
  const spec = (r: DistRule) => (r.region ? 2 : 0) + (r.saleType !== "ANY" ? 1 : 0);
  const candidates = rules
    .filter((r) => r.active && r.sellerActive)
    .filter((r) => r.saleType === "ANY" || r.saleType === saleType)
    .filter((r) => {
      if (!r.region) return true;
      const reg = normalize(r.region);
      return Boolean(c) && (c.includes(reg) || reg.includes(c));
    });
  if (!candidates.length) return [];
  const best = candidates.reduce((m, r) => Math.max(m, spec(r) * 100000 + r.priority), -Infinity);
  const ids: string[] = [];
  for (const r of candidates) if (spec(r) * 100000 + r.priority === best && !ids.includes(r.sellerId)) ids.push(r.sellerId);
  return ids;
}

/**
 * Escolhe o vendedor do grupo empatado:
 * - só quem está no turno agora (sem turno configurado = sempre disponível);
 *   se ninguém está no turno, quem entra primeiro;
 * - entre os disponíveis, rodízio: cada um recebe `batch` leads seguidos.
 */
export function chooseSeller(
  pool: string[],
  opts: {
    shifts: Record<string, unknown>;
    rotation: { enabled: boolean; batch: number };
    state: RotationState;
    now?: Date;
  }
): { sellerId: string | null; state: RotationState } {
  if (!pool.length) return { sellerId: null, state: opts.state };
  const now = opts.now || new Date();
  const ordered = [...pool].sort();
  const hours = new Map(ordered.map((id) => [id, normalizeSellerHours(opts.shifts[id])]));
  let available = ordered.filter((id) => sellerAvailability(hours.get(id)!, now).open);
  if (!available.length) {
    // Ninguém no turno: quem começa primeiro
    const next = ordered
      .map((id) => ({ id, at: nextOpenAt(hours.get(id)!, now) }))
      .filter((x): x is { id: string; at: Date } => Boolean(x.at))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const first = next[0]?.at.getTime();
    available = first == null ? ordered : next.filter((x) => x.at.getTime() === first).map((x) => x.id);
  }
  if (available.length === 1 || !opts.rotation.enabled) return { sellerId: available[0], state: opts.state };

  const key = ordered.join(",");
  const last = opts.state[key];
  const batch = Math.max(1, Math.min(50, Math.round(opts.rotation.batch || 1)));
  let sellerId: string;
  let count: number;
  if (last && available.includes(last.sellerId) && last.count < batch) {
    sellerId = last.sellerId;
    count = last.count + 1;
  } else {
    // Próximo da fila depois do último (entre os disponíveis)
    const idx = last ? ordered.indexOf(last.sellerId) : -1;
    const after = [...ordered.slice(idx + 1), ...ordered.slice(0, idx + 1)];
    sellerId = after.find((id) => available.includes(id) && id !== last?.sellerId) || available[0];
    count = 1;
  }
  return { sellerId, state: { ...opts.state, [key]: { sellerId, count } } };
}
