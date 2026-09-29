/**
 * Medidas fixas dos blocos do fluxo: as bolinhas de ligação ficam sempre no mesmo lugar,
 * então as linhas podem ser calculadas sem medir a tela.
 */
import type { BotNext, BotStep } from "@/lib/chatbot/common";
import { stepKind } from "@/lib/chatbot/common";

export const NODE_W = 300;
export const HEADER_H = 46;
export const MSG_H = 92;
export const MEDIA_H = 150;
export const CAPTION_H = 34;
export const ROW_H = 40;
export const FOOT = 10;

export const START_W = 250;
export const START_H = 104;

export type Pos = { x: number; y: number };
/** Saída de um bloco: uma opção (id da opção) ou "next" (bloco sem opções) */
export type PortKey = string;

export function bodyHeight(s: BotStep) {
  const kind = stepKind(s);
  return kind === "MENU" ? MSG_H : MEDIA_H + CAPTION_H;
}

/** Linhas com bolinha de saída: as opções do menu ou uma linha "Depois" */
export function portRows(s: BotStep): { key: PortKey; label: string; next: BotNext; to: string | null; agentId: string | null }[] {
  if (stepKind(s) === "MENU" && s.options.length) {
    return s.options.map((o) => ({ key: o.id, label: o.label, next: o.next, to: o.next === "STEP" ? o.stepId : null, agentId: o.agentId || null }));
  }
  return [{ key: "next", label: "Depois", next: s.next, to: s.next === "STEP" ? s.nextStepId || null : null, agentId: s.agentId || null }];
}

export function nodeHeight(s: BotStep) {
  return HEADER_H + bodyHeight(s) + portRows(s).length * ROW_H + FOOT;
}

export function portOut(s: BotStep, pos: Pos, key: PortKey): Pos {
  const rows = portRows(s);
  const i = Math.max(0, rows.findIndex((r) => r.key === key));
  return { x: pos.x + NODE_W, y: pos.y + HEADER_H + bodyHeight(s) + i * ROW_H + ROW_H / 2 };
}

export function portIn(pos: Pos): Pos {
  return { x: pos.x, y: pos.y + HEADER_H / 2 };
}

export function curve(a: Pos, b: Pos) {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** Organiza em colunas a partir do bloco inicial (quem não tem posição ou pediu "Organizar") */
export function autoLayout(steps: BotStep[]): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  if (!steps.length) return out;
  const level = new Map<string, number>();
  const queue = [steps[0].id];
  level.set(steps[0].id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const s = steps.find((x) => x.id === id);
    if (!s) continue;
    for (const r of portRows(s)) {
      if (r.to && !level.has(r.to) && steps.some((x) => x.id === r.to)) {
        level.set(r.to, (level.get(id) || 0) + 1);
        queue.push(r.to);
      }
    }
  }
  // Blocos soltos (sem ligação) vão para uma coluna no fim
  const maxLevel = Math.max(0, ...level.values());
  for (const s of steps) if (!level.has(s.id)) level.set(s.id, maxLevel + 1);
  const colY = new Map<number, number>();
  for (const s of steps) {
    const l = level.get(s.id) || 0;
    const y = colY.get(l) || 0;
    out[s.id] = { x: 340 + l * 400, y };
    colY.set(l, y + nodeHeight(s) + 44);
  }
  return out;
}
