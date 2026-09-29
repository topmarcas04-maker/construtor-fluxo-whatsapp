"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Sparkles, UserRound, CircleStop, Zap, X, LayoutGrid, Tag as TagIcon, Columns3, MessageSquare, Play } from "lucide-react";
import type { BotNext, BotStep, StepKind } from "@/lib/chatbot/common";
import { TRIGGER_LABEL, fillBotText } from "@/lib/chatbot/common";
import { KIND_META, fileUrl, kindOfStep, type Draft } from "./shared";
import {
  CAPTION_H,
  HEADER_H,
  MEDIA_H,
  MSG_H,
  NODE_W,
  ROW_H,
  START_H,
  START_W,
  curve,
  nodeHeight,
  portIn,
  portOut,
  portRows,
  type PortKey,
  type Pos,
} from "./layout";

type DragState =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "node"; id: string; sx: number; sy: number; nx: number; ny: number; moved: boolean }
  | { kind: "link"; from: string; port: PortKey };

export interface LinkFrom {
  stepId: string | "start";
  port: PortKey;
}

const END_OPTIONS: { value: Exclude<BotNext, "STEP">; label: string }[] = [
  { value: "HUMAN", label: "👤 Equipe" },
  { value: "AI", label: "✨ IA" },
  { value: "END", label: "⏹ Encerra" },
];
const END_ICON = { HUMAN: UserRound, AI: Sparkles, END: CircleStop } as const;

const ADD_KINDS: StepKind[] = ["MENU", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"];

export function FlowCanvas({
  draft,
  selected,
  activeId,
  onSelect,
  onMove,
  onConnect,
  onDisconnect,
  onSetEnd,
  onCreate,
  onAutoLayout,
  agents,
}: {
  draft: Draft;
  selected: string | null;
  /** Bloco em que o testador está agora (fica aceso) */
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, pos: Pos) => void;
  onConnect: (from: LinkFrom, to: string) => void;
  onDisconnect: (from: LinkFrom) => void;
  onSetEnd: (from: LinkFrom, next: Exclude<BotNext, "STEP">, agentId?: string | null) => void;
  onCreate: (kind: StepKind, pos: Pos, from?: LinkFrom) => void;
  /** Agentes de IA (para escolher quem assume) */
  agents: { id: string; name: string; isPrimary: boolean }[];
  onAutoLayout: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 0.85 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<DragState | null>(null);
  const [link, setLink] = useState<{ from: LinkFrom; x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ sx: number; sy: number; wx: number; wy: number; from?: LinkFrom } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const steps = draft.steps;
  const posOf = useCallback((s: BotStep): Pos => s.pos || { x: 340, y: 0 }, []);
  const first = steps[0];
  const startPos: Pos = first ? { x: posOf(first).x - START_W - 90, y: posOf(first).y + 4 } : { x: 0, y: 0 };
  const startPort: Pos = { x: startPos.x + START_W, y: startPos.y + START_H / 2 };
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const toWorld = (cx: number, cy: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };

  const fromPoint = (from: LinkFrom): Pos | null => {
    if (from.stepId === "start") return startPort;
    const s = byId.get(from.stepId);
    return s ? portOut(s, posOf(s), from.port) : null;
  };

  // Arrastar (tela, bloco, ligação)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === "pan") setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
      if (d.kind === "node") {
        const z = viewRef.current.zoom;
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
        onMove(d.id, { x: Math.round(d.nx + (e.clientX - d.sx) / z), y: Math.round(d.ny + (e.clientY - d.sy) / z) });
      }
      if (d.kind === "link") {
        const w = toWorld(e.clientX, e.clientY);
        setLink((l) => (l ? { ...l, x: w.x, y: w.y } : l));
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-node-in]") as HTMLElement | null;
        setHoverTarget(el?.dataset.nodeIn || null);
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.kind !== "link") return;
      const from = { stepId: d.from, port: d.port } as LinkFrom;
      setLink(null);
      setHoverTarget(null);
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-node-in]") as HTMLElement | null;
      const to = el?.dataset.nodeIn;
      if (to) {
        if (to !== d.from) onConnect(from, to);
        return;
      }
      // Soltou no vazio: oferece criar um bloco ali, já ligado
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const w = toWorld(e.clientX, e.clientY);
      setMenu({ sx: e.clientX - r.left, sy: e.clientY - r.top, wx: w.x, wy: w.y - HEADER_H / 2, from });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMove, onConnect]);

  // Zoom com Ctrl + roda (ou pinça); roda sozinha move a tela
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const zoom = Math.min(1.6, Math.max(0.3, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => {
      const r = canvasRef.current!.getBoundingClientRect();
      const zoom = Math.min(1.6, Math.max(0.3, v.zoom * f));
      const px = r.width / 2;
      const py = r.height / 2;
      return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
    });

  const fit = useCallback(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !steps.length) return;
    const xs = steps.map((s) => posOf(s).x);
    const ys = steps.map((s) => posOf(s).y);
    const minX = Math.min(startPos.x, ...xs) - 20;
    const minY = Math.min(startPos.y, ...ys) - 20;
    const maxX = Math.max(...steps.map((s) => posOf(s).x + NODE_W)) + 140;
    const maxY = Math.max(...steps.map((s) => posOf(s).y + nodeHeight(s))) + 20;
    const zoom = Math.min(1, Math.max(0.3, Math.min((r.width - 40) / (maxX - minX), (r.height - 90) / (maxY - minY))));
    setView({ zoom, x: 20 - minX * zoom, y: 20 - minY * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, startPos.x, startPos.y]);

  // Enquadra ao abrir
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !steps.length || !canvasRef.current) return;
    fitted.current = true;
    fit();
  }, [steps.length, fit]);

  const addAtCenter = (kind: StepKind) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const x = r ? (r.width / 2 - v.x) / v.zoom - NODE_W / 2 : 400;
    const y = r ? (r.height / 2 - v.y) / v.zoom - 120 : 100;
    onCreate(kind, { x: Math.round(x + Math.random() * 40), y: Math.round(y + Math.random() * 40) });
  };

  const startLink = (e: React.PointerEvent, from: LinkFrom) => {
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { kind: "link", from: from.stepId, port: from.port };
    setLink({ from, x: w.x, y: w.y });
    setMenu(null);
  };

  // Ligações
  type Edge = { id: string; from: LinkFrom; to: string; a: Pos; b: Pos; color: string };
  const edges: Edge[] = [];
  if (first) edges.push({ id: "start", from: { stepId: "start", port: "start" }, to: first.id, a: startPort, b: portIn(posOf(first)), color: "#0f766e" });
  for (const s of steps) {
    for (const r of portRows(s)) {
      const t = r.to ? byId.get(r.to) : null;
      if (!t) continue;
      edges.push({
        id: `${s.id}:${r.key}`,
        from: { stepId: s.id, port: r.key },
        to: t.id,
        a: portOut(s, posOf(s), r.key),
        b: portIn(posOf(t)),
        color: KIND_META[kindOfStep(s)].color,
      });
    }
  }
  const linkFrom = link ? fromPoint(link.from) : null;

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f9fb]"
      style={{
        backgroundImage: "radial-gradient(circle, #d5dde5 1.1px, transparent 1.2px)",
        backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return;
        onSelect(null);
        setMenu(null);
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      }}
    >
      <div data-bg="1" className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {/* Linhas */}
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
          <defs>
            <marker id="cb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          {edges.map((e) => (
            <g key={e.id}>
              <path d={curve(e.a, e.b)} stroke="white" strokeWidth={7} fill="none" />
              <path
                d={curve(e.a, e.b)}
                stroke={e.color}
                strokeWidth={hoverEdge === e.id ? 3.5 : 2.4}
                fill="none"
                opacity={0.9}
                markerEnd="url(#cb-arrow)"
                className={activeId && e.to === activeId ? "cb-flow" : ""}
              />
            </g>
          ))}
          {link && linkFrom && <path d={curve(linkFrom, link)} stroke="#0f766e" strokeWidth={2.4} strokeDasharray="7 6" fill="none" />}
        </svg>

        {/* Botão para desligar, no meio de cada linha */}
        {edges.map((e) => (
          <button
            key={`x-${e.id}`}
            type="button"
            onPointerDown={(ev) => ev.stopPropagation()}
            onMouseEnter={() => setHoverEdge(e.id)}
            onMouseLeave={() => setHoverEdge(null)}
            onClick={() => onDisconnect(e.from)}
            className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-60 shadow-sm transition hover:scale-110 hover:border-red-300 hover:text-red-500 hover:opacity-100"
            style={{ left: (e.a.x + e.b.x) / 2, top: (e.a.y + e.b.y) / 2 }}
            title="Desligar"
            aria-label="Desligar"
          >
            <X size={12} />
          </button>
        ))}

        {/* Início */}
        {first && (
          <div
            className={`absolute rounded-2xl border-2 bg-gradient-to-br from-teal-600 to-teal-800 p-4 text-white shadow-lg shadow-teal-900/20 transition ${
              selected === "start" ? "border-amber-300 ring-4 ring-amber-200/60" : "border-transparent"
            }`}
            style={{ left: startPos.x, top: startPos.y, width: START_W, height: START_H }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect("start");
            }}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-100">
              <Zap size={13} /> Quando começa
            </p>
            <p className="mt-1 text-[15px] font-bold">{TRIGGER_LABEL[draft.trigger]}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-teal-50/90">
              {draft.trigger === "KEYWORD"
                ? draft.keywords.map((k) => `"${k}"`).join(", ") || "Nenhuma palavra-chave"
                : draft.trigger === "TAG"
                ? "Lead com a etiqueta escolhida"
                : `Lead novo ou que volta depois de ${draft.restartHours}h`}
            </p>
            <span
              className="group absolute -right-3 flex h-6 w-6 cursor-crosshair items-center justify-center"
              style={{ top: START_H / 2 - 12 }}
              onPointerDown={(e) => startLink(e, { stepId: "start", port: "start" })}
              title="Arraste para escolher o primeiro bloco"
            >
              <span className="h-4 w-4 rounded-full border-[3px] border-white bg-amber-400 shadow transition group-hover:scale-125" />
            </span>
          </div>
        )}

        {/* Blocos */}
        {steps.map((s, i) => (
          <FlowNode
            key={s.id}
            step={s}
            pos={posOf(s)}
            isFirst={i === 0}
            selected={selected === s.id}
            active={activeId === s.id}
            linkTarget={Boolean(link && hoverTarget === s.id && link.from.stepId !== s.id)}
            linking={Boolean(link && link.from.stepId !== s.id)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setMenu(null);
              onSelect(s.id);
              const p = posOf(s);
              drag.current = { kind: "node", id: s.id, sx: e.clientX, sy: e.clientY, nx: p.x, ny: p.y, moved: false };
            }}
            onLinkStart={(e, port) => startLink(e, { stepId: s.id, port })}
            onSetEnd={(port, next, agentId) => onSetEnd({ stepId: s.id, port }, next, agentId)}
            agents={agents}
          />
        ))}
      </div>

      {/* Menu ao soltar a linha no vazio */}
      {menu && (
        <div
          className="absolute z-30 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
          style={{ left: Math.min(menu.sx, (canvasRef.current?.clientWidth || 800) - 220), top: Math.min(menu.sy, (canvasRef.current?.clientHeight || 600) - 230) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Criar bloco aqui</p>
          {ADD_KINDS.map((k) => {
            const M = KIND_META[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onCreate(k, { x: Math.round(menu.wx), y: Math.round(menu.wy) }, menu.from);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: M.color }}>
                  <M.Icon size={15} />
                </span>
                {M.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setMenu(null)} className="w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      )}

      {/* Barra de blocos */}
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">Adicionar</span>
        {ADD_KINDS.map((k) => {
          const M = KIND_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => addAtCenter(k)}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-100"
              title={`Novo bloco: ${M.label}`}
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg text-white" style={{ background: M.color }}>
                <M.Icon size={13} />
              </span>
              <span className="hidden md:inline">{M.label}</span>
            </button>
          );
        })}
      </div>

      {/* Zoom */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(0.85)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Diminuir zoom">
          <Minus size={15} />
        </button>
        <span className="w-11 text-center text-xs font-semibold text-slate-500">{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.15)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Aumentar zoom">
          <Plus size={15} />
        </button>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <button type="button" onClick={fit} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title="Enquadrar tudo" aria-label="Enquadrar tudo">
          <Maximize2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            onAutoLayout();
            setTimeout(fit, 30);
          }}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          title="Organizar os blocos"
          aria-label="Organizar os blocos"
        >
          <LayoutGrid size={15} />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-4 left-4 z-10 hidden text-[11px] text-slate-400 lg:block">
        Puxe a bolinha de uma opção até outro bloco para ligar · arraste o fundo para mover · Ctrl + roda para zoom
      </p>

      <style>{`
        .cb-flow { stroke-dasharray: 8 6; animation: cbflow 0.8s linear infinite; }
        @keyframes cbflow { to { stroke-dashoffset: -28; } }
      `}</style>
    </div>
  );
}

// ============================================================================
// BLOCO
// ============================================================================

function FlowNode({
  step,
  pos,
  isFirst,
  selected,
  active,
  linkTarget,
  linking,
  onPointerDown,
  onLinkStart,
  onSetEnd,
  agents,
}: {
  step: BotStep;
  pos: Pos;
  isFirst: boolean;
  selected: boolean;
  active: boolean;
  linkTarget: boolean;
  linking: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onLinkStart: (e: React.PointerEvent, port: PortKey) => void;
  onSetEnd: (port: PortKey, next: Exclude<BotNext, "STEP">, agentId?: string | null) => void;
  agents: { id: string; name: string; isPrimary: boolean }[];
}) {
  const kind = kindOfStep(step);
  const M = KIND_META[kind];
  const rows = portRows(step);
  const opts = new Map(step.options.map((o) => [o.id, o]));
  const height = nodeHeight(step);

  return (
    <div
      data-node-in={step.id}
      className={`absolute rounded-2xl border bg-white shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] transition-[box-shadow,border-color] ${
        linkTarget
          ? "border-teal-500 ring-4 ring-teal-300/50"
          : active
          ? "border-amber-400 ring-4 ring-amber-300/60"
          : selected
          ? "border-[var(--accent)] ring-4 ring-[var(--accent)]/15"
          : linking
          ? "border-dashed border-teal-300"
          : "border-slate-200"
      }`}
      style={{ left: pos.x, top: pos.y, width: NODE_W, height }}
      onPointerDown={onPointerDown}
    >
      {/* Entrada */}
      <span data-node-in={step.id} className="absolute -left-[9px] flex h-[18px] w-[18px] items-center justify-center" style={{ top: HEADER_H / 2 - 9 }}>
        <span data-node-in={step.id} className="h-3.5 w-3.5 rounded-full border-[3px] border-white shadow" style={{ background: M.color }} />
      </span>

      {/* Cabeçalho */}
      <div data-node-in={step.id} className="flex cursor-grab items-center gap-2 rounded-t-2xl border-b border-slate-100 px-3 active:cursor-grabbing" style={{ height: HEADER_H }}>
        <span data-node-in={step.id} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white shadow-sm" style={{ background: M.color }}>
          <M.Icon size={15} />
        </span>
        <span data-node-in={step.id} className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-800">
          {step.name || M.label}
        </span>
        {isFirst && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            <Play size={9} className="fill-current" /> Início
          </span>
        )}
        {active && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" title="O teste está aqui" />}
      </div>

      {/* Conteúdo */}
      {kind === "MENU" ? (
        <div data-node-in={step.id} className="px-3 pt-2.5" style={{ height: MSG_H }}>
          <div data-node-in={step.id} className="h-full overflow-hidden rounded-xl rounded-tl-sm bg-[#dcf8c6] px-3 py-2 text-[12.5px] leading-snug text-slate-800">
            {step.message.trim() ? (
              <p data-node-in={step.id} className="line-clamp-4 whitespace-pre-line">
                {fillBotText(step.message, { nome: "Maria" })}
              </p>
            ) : (
              <p className="text-slate-400">Escreva a mensagem no painel →</p>
            )}
          </div>
        </div>
      ) : (
        <div data-node-in={step.id} className="px-3 pt-2.5" style={{ height: MEDIA_H + CAPTION_H }}>
          <MediaPreview step={step} />
          <p data-node-in={step.id} className="mt-1.5 truncate text-[12px] text-slate-500" style={{ height: CAPTION_H - 10 }}>
            {kind === "AUDIO" ? "🎤 Chega como áudio gravado na hora" : step.message.trim() ? fillBotText(step.message, { nome: "Maria" }) : "Sem legenda"}
          </p>
        </div>
      )}

      {/* Saídas */}
      <div className="px-2">
        {rows.map((r, i) => {
          const o = opts.get(r.key);
          const connected = r.next === "STEP" && r.to;
          const EndIcon = r.next !== "STEP" ? END_ICON[r.next as Exclude<BotNext, "STEP">] : null;
          return (
            <div key={r.key} className={`relative flex items-center gap-2 px-1 ${i > 0 ? "border-t border-dashed border-slate-100" : ""}`} style={{ height: ROW_H }}>
              {o ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-800 text-[11px] font-bold text-white">{o.key}</span>
              ) : (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500">
                  <Play size={10} className="fill-current" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-700">{o ? o.label || "Opção sem texto" : "Depois"}</span>
              {o && (
                <span className="flex shrink-0 items-center gap-1 text-slate-400">
                  {o.reply.trim() && <MessageSquare size={12} />}
                  {o.addTagIds.length > 0 && <TagIcon size={12} />}
                  {o.columnId && <Columns3 size={12} />}
                  {o.sellerId && <UserRound size={12} />}
                </span>
              )}
              {/* Fim sem ligação: o que acontece */}
              {!connected && EndIcon && (
                <span className="absolute flex items-center" style={{ left: NODE_W - 8 + 18 }} onPointerDown={(e) => e.stopPropagation()}>
                  <EndIcon size={12} className="pointer-events-none absolute left-2 text-slate-500" />
                  <select
                    value={r.next === "AI" && r.agentId && agents.some((a) => a.id === r.agentId) ? `AI:${r.agentId}` : r.next}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("AI:")) onSetEnd(r.key, "AI", v.slice(3));
                      else onSetEnd(r.key, v as Exclude<BotNext, "STEP">, null);
                    }}
                    className={`max-w-[190px] cursor-pointer appearance-none truncate rounded-full border py-1 pl-6 pr-2.5 text-[11px] font-semibold shadow-sm outline-none ${
                      r.next === "AI" ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    title="O que acontece se não ligar a outro bloco"
                  >
                    {END_OPTIONS.filter((x) => x.value !== "AI").map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label.replace(/^\S+\s/, "")}
                      </option>
                    ))}
                    <optgroup label="Passar para a IA">
                      <option value="AI">IA (agente normal)</option>
                      {agents.map((a) => (
                        <option key={a.id} value={`AI:${a.id}`}>
                          IA: {a.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </span>
              )}
              {/* Saída */}
              <span
                className="group absolute flex h-6 w-6 cursor-crosshair items-center justify-center"
                style={{ left: NODE_W - 8 - 12, top: ROW_H / 2 - 12 }}
                onPointerDown={(e) => onLinkStart(e, r.key)}
                title="Puxe até outro bloco"
              >
                <span
                  className={`h-3.5 w-3.5 rounded-full border-[3px] border-white shadow transition group-hover:scale-150 ${connected ? "" : "ring-2 ring-slate-200"}`}
                  style={{ background: connected ? M.color : "#cbd5e1" }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MediaPreview({ step }: { step: BotStep }) {
  const kind = kindOfStep(step);
  const M = KIND_META[kind];
  const m = step.media;
  const box = "flex items-center justify-center overflow-hidden rounded-xl";
  if (!m) {
    return (
      <div data-node-in={step.id} className={`${box} border-2 border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-400`} style={{ height: MEDIA_H }}>
        <div>
          <M.Icon size={26} className="mx-auto mb-1 opacity-60" />
          Envie o arquivo no painel →
        </div>
      </div>
    );
  }
  if (kind === "IMAGE") {
    return (
      <div data-node-in={step.id} className={`${box} bg-slate-100`} style={{ height: MEDIA_H }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-node-in={step.id} src={fileUrl(m.fileId)} alt="" draggable={false} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (kind === "VIDEO") {
    return (
      <div data-node-in={step.id} className={`${box} relative bg-slate-900`} style={{ height: MEDIA_H }}>
        <video data-node-in={step.id} src={`${fileUrl(m.fileId)}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover opacity-90" />
        <span className="absolute grid h-11 w-11 place-items-center rounded-full bg-white/90 text-rose-600 shadow-lg">
          <Play size={18} className="ml-0.5 fill-current" />
        </span>
      </div>
    );
  }
  if (kind === "AUDIO") {
    return (
      <div data-node-in={step.id} className={`${box} flex-col gap-2 bg-gradient-to-br from-violet-50 to-violet-100`} style={{ height: MEDIA_H }}>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-white">
            <Play size={13} className="ml-0.5 fill-current" />
          </span>
          <span className="flex h-6 items-center gap-[3px]">
            {[8, 14, 20, 12, 18, 24, 10, 16, 22, 9, 15, 19, 11, 7].map((h, i) => (
              <span key={i} className="w-[3px] rounded-full bg-violet-400" style={{ height: h }} />
            ))}
          </span>
        </div>
        <span className="max-w-[240px] truncate text-[11px] text-violet-700">{m.name}</span>
      </div>
    );
  }
  return (
    <div data-node-in={step.id} className={`${box} flex-col gap-1 bg-gradient-to-br from-amber-50 to-orange-100`} style={{ height: MEDIA_H }}>
      <span className="grid h-14 w-12 place-items-center rounded-lg bg-white text-[11px] font-black text-red-600 shadow">PDF</span>
      <span className="max-w-[240px] truncate px-2 text-[11px] font-semibold text-amber-800">{m.name}</span>
    </div>
  );
}
