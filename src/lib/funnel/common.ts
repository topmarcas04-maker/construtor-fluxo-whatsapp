/** Colunas do funil — parte usada também no navegador (sem dependências). */

export const SYSTEM_KINDS = ["FIRST_CONTACT", "SECOND_CONTACT", "HOT_LEAD", "SALE"] as const;
export type SystemKind = (typeof SYSTEM_KINDS)[number];

export const COLUMN_COLORS = ["slate", "blue", "violet", "amber", "orange", "emerald", "rose", "cyan"] as const;

export const DEFAULT_COLUMNS: { kind: string; name: string; aiRule?: string; color?: string }[] = [
  { kind: "FIRST_CONTACT", name: "Primeiro contato" },
  { kind: "SECOND_CONTACT", name: "Segundo contato" },
  { kind: "HOT_LEAD", name: "Lead quente" },
  {
    kind: "CUSTOM",
    name: "Ligação",
    color: "blue",
    aiRule: "O cliente pediu para receber uma ligação ou quer que alguém ligue para ele.",
  },
  { kind: "SALE", name: "Vendas" },
];

export interface FunnelColumn {
  id: string;
  name: string;
  kind: string;
  aiRule: string | null;
  color: string | null;
  sort: number;
}

const LEGACY: Record<string, SystemKind> = {
  PROSPECT: "FIRST_CONTACT",
  QUALIFIED: "SECOND_CONTACT",
  NEGOTIATING: "HOT_LEAD",
  CLOSED_WON: "SALE",
  CLOSED_LOST: "SALE",
};

export function normalizeStage(stage: string): SystemKind {
  return (SYSTEM_KINDS as readonly string[]).includes(stage) ? (stage as SystemKind) : LEGACY[stage] || "FIRST_CONTACT";
}

/** Em qual coluna o lead aparece */
export function columnOfLead<T extends { id: string; kind: string }>(
  lead: { stage: string; columnId?: string | null },
  columns: T[]
): T | undefined {
  if (lead.columnId) {
    const c = columns.find((x) => x.id === lead.columnId);
    if (c) return c;
  }
  const st = normalizeStage(lead.stage);
  return columns.find((c) => c.kind === st) || columns[0];
}
