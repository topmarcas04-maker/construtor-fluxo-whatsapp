"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Workflow, Plus, Pencil, Trash2, ArrowLeft, Info, Copy, Play } from "lucide-react";
import { Page, PageHeader, Card, Button, Toggle, Badge, ErrorNote } from "@/components/ui";
import {
  BOT_CHANNELS,
  DEFAULT_FALLBACK,
  fillBotText,
  newId,
  stepKind,
  templateSteps,
  triggerSummary,
  type BotNext,
  type BotStep,
  type Chatbot,
  type StepKind,
} from "@/lib/chatbot/common";
import { FlowCanvas, type LinkFrom } from "@/components/chatbot/FlowCanvas";
import { BlockPanel, StartPanel } from "@/components/chatbot/BlockPanel";
import { Simulator } from "@/components/chatbot/Simulator";
import { KIND_META, api, type Draft, type Refs, type TagRef } from "@/components/chatbot/shared";
import { autoLayout, type Pos } from "@/components/chatbot/layout";

function newDraft(): Draft {
  const steps = templateSteps();
  const pos = autoLayout(steps);
  return {
    name: "Menu de atendimento",
    active: true,
    trigger: "START",
    keywords: ["menu"],
    tagIds: [],
    skipTagIds: [],
    channels: ["WHATSAPP", "INSTAGRAM", "MESSENGER"],
    restartHours: 24,
    steps: steps.map((s) => ({ ...s, pos: pos[s.id] })),
    fallbackMessage: DEFAULT_FALLBACK,
    maxTries: 2,
    afterFail: "HUMAN",
  };
}

// ============================================================================
// TELA
// ============================================================================

export function ChatbotScreen() {
  const [bots, setBots] = useState<Chatbot[] | null>(null);
  const [refs, setRefs] = useState<Refs>({ tags: [], sellers: [], funnels: [], aiEnabled: false, storageReady: false, agents: [] });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api("/api/chatbot", "GET");
    setBots(d.bots);
    setRefs({ tags: d.tags, sellers: d.sellers, funnels: d.funnels, aiEnabled: d.aiEnabled, storageReady: Boolean(d.storageReady), agents: d.agents || [] });
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const tagName = (id: string) => refs.tags.find((t) => t.id === id)?.name || "?";

  const toggle = async (b: Chatbot, active: boolean) => {
    setBots((list) => list?.map((x) => (x.id === b.id ? { ...x, active } : x)) || null);
    try {
      const d = await api(`/api/chatbot/${b.id}`, "PUT", { active });
      setBots(d.bots);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };
  const duplicate = (b: Chatbot) => {
    const { id, sort, ...rest } = JSON.parse(JSON.stringify(b)) as Chatbot;
    void id;
    void sort;
    setEditing({ ...rest, name: `${b.name} (cópia)`.slice(0, 120), active: false });
  };
  const remove = async (b: Chatbot) => {
    if (!confirm(`Excluir o chatbot "${b.name}"?`)) return;
    try {
      const d = await api(`/api/chatbot/${b.id}`, "DELETE");
      setBots(d.bots);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (editing) {
    return (
      <BotEditor
        draft={editing}
        refs={refs}
        onTagCreated={(t) => setRefs((r) => ({ ...r, tags: [...r.tags, t] }))}
        onCancel={() => setEditing(null)}
        onSaved={(list) => {
          setBots(list);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <Page>
      <PageHeader
        title="Chatbot"
        description="Fluxos automáticos sem IA: mensagens, menus, fotos, áudios, vídeos e PDFs ligados como um desenho. O cliente responde com o número da opção. Não gasta créditos de IA."
        actions={
          <Button onClick={() => setEditing(newDraft())}>
            <Plus size={16} /> Novo chatbot
          </Button>
        }
      />
      <ErrorNote message={error} />

      <Card className="mb-5 flex gap-3 p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="text-sm text-slate-600">
          <p>
            <b className="text-slate-800">Como convive com a IA:</b> o chatbot responde primeiro. Quando ele termina, a conversa
            segue para a <b>equipe</b> ou para a <b>IA</b>, conforme a opção escolhida.
            {refs.aiEnabled ? " A IA desta conta está ligada." : " A IA desta conta está desligada: só o chatbot e a equipe respondem."}
          </p>
          <p className="mt-1">
            Se alguém da equipe responder a conversa, o chatbot para naquela conversa. Leads com vendedor definido não entram no
            chatbot.
          </p>
        </div>
      </Card>

      {bots === null ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : bots.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <Workflow size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">Nenhum chatbot ainda</p>
          <p className="mt-1 text-sm text-slate-500">Comece pelo modelo pronto de menu de atendimento e ajuste do seu jeito.</p>
          <Button className="mt-5" onClick={() => setEditing(newDraft())}>
            <Plus size={16} /> Criar a partir do modelo
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bots.map((b) => (
            <Card key={b.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                    <Workflow size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{b.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.steps.length} {b.steps.length === 1 ? "bloco" : "blocos"} ·{" "}
                      {b.channels.map((c) => BOT_CHANNELS.find((x) => x.key === c)?.label).join(", ")}
                    </p>
                  </div>
                </div>
                <Toggle checked={b.active} onChange={(v) => toggle(b, v)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone="blue">{triggerSummary(b, tagName)}</Badge>
                {b.skipTagIds.length > 0 && <Badge tone="gray">Não inicia com: {b.skipTagIds.map(tagName).join(", ")}</Badge>}
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-600">{fillBotText(b.steps[0]?.message || "", {})}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["MENU", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"] as StepKind[]).map((k) => {
                  const n = b.steps.filter((x) => stepKind(x) === k).length;
                  if (!n) return null;
                  const M = KIND_META[k];
                  return (
                    <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${M.soft} ${M.text}`}>
                      <M.Icon size={11} /> {n} {M.label.toLowerCase()}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="ghost" onClick={() => remove(b)} title="Excluir">
                  <Trash2 size={15} />
                </Button>
                <Button variant="ghost" onClick={() => duplicate(b)} title="Duplicar">
                  <Copy size={15} />
                </Button>
                <Button variant="secondary" onClick={() => setEditing({ ...b })}>
                  <Pencil size={15} /> Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

// ============================================================================
// EDITOR (fluxo de ligar os pontos)
// ============================================================================

function withPositions(d: Draft): Draft {
  if (d.steps.every((s) => s.pos)) return d;
  const pos = autoLayout(d.steps);
  return { ...d, steps: d.steps.map((s) => ({ ...s, pos: s.pos || pos[s.id] })) };
}

function BotEditor({
  draft: initial,
  refs,
  onCancel,
  onSaved,
  onTagCreated,
}: {
  draft: Draft;
  refs: Refs;
  onCancel: () => void;
  onSaved: (bots: Chatbot[]) => void;
  onTagCreated: (t: TagRef) => void;
}) {
  const [d, setD] = useState<Draft>(() => withPositions(JSON.parse(JSON.stringify(initial))));
  const [selected, setSelected] = useState<string | null>("start");
  const [tab, setTab] = useState<"bloco" | "testar">("bloco");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const change = useCallback((fn: (x: Draft) => Draft) => {
    setD(fn);
    setDirty(true);
  }, []);
  const set = (patch: Partial<Draft>) => change((x) => ({ ...x, ...patch }));
  const setStep = (id: string, patch: Partial<BotStep>) => change((x) => ({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const onMove = useCallback((id: string, pos: Pos) => change((x) => ({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, pos } : s)) })), [change]);

  const link = (x: Draft, from: LinkFrom, to: string): Draft => {
    if (from.stepId === "start") {
      const t = x.steps.find((s) => s.id === to);
      return t ? { ...x, steps: [t, ...x.steps.filter((s) => s.id !== to)] } : x;
    }
    return {
      ...x,
      steps: x.steps.map((s) => {
        if (s.id !== from.stepId) return s;
        if (from.port === "next") return { ...s, next: "STEP" as BotNext, nextStepId: to };
        return { ...s, options: s.options.map((o) => (o.id === from.port ? { ...o, next: "STEP" as BotNext, stepId: to } : o)) };
      }),
    };
  };
  const onConnect = useCallback((from: LinkFrom, to: string) => change((x) => link(x, from, to)), [change]);
  const onDisconnect = (from: LinkFrom) =>
    change((x) => {
      if (from.stepId === "start") return x;
      return {
        ...x,
        steps: x.steps.map((s) => {
          if (s.id !== from.stepId) return s;
          if (from.port === "next") return { ...s, next: "END" as BotNext, nextStepId: null };
          return { ...s, options: s.options.map((o) => (o.id === from.port ? { ...o, next: "HUMAN" as BotNext, stepId: null } : o)) };
        }),
      };
    });
  const onSetEnd = (from: LinkFrom, next: Exclude<BotNext, "STEP">, agentId?: string | null) =>
    change((x) => ({
      ...x,
      steps: x.steps.map((s) => {
        if (s.id !== from.stepId) return s;
        const a = next === "AI" ? agentId || null : null;
        if (from.port === "next") return { ...s, next, nextStepId: null, agentId: a };
        return { ...s, options: s.options.map((o) => (o.id === from.port ? { ...o, next, stepId: null, agentId: a } : o)) };
      }),
    }));

  const onCreate = (kind: StepKind, pos: Pos, from?: LinkFrom) => {
    const id = newId();
    const count = d.steps.filter((s) => stepKind(s) === kind).length + 1;
    const step: BotStep = {
      id,
      name: `${KIND_META[kind].label} ${count}`,
      message: "",
      options: [],
      next: "END",
      nextStepId: null,
      kind,
      media: null,
      pos,
    };
    change((x) => {
      const withNew = { ...x, steps: [...x.steps, step] };
      return from ? link(withNew, from, id) : withNew;
    });
    setSelected(id);
    setTab("bloco");
  };

  const removeStep = (id: string) => {
    if (d.steps.length <= 1) return;
    if (!confirm("Excluir este bloco? O que estava ligado a ele passa para a equipe.")) return;
    change((x) => ({
      ...x,
      steps: x.steps
        .filter((s) => s.id !== id)
        .map((s) => ({
          ...s,
          next: s.next === "STEP" && s.nextStepId === id ? ("END" as BotNext) : s.next,
          nextStepId: s.nextStepId === id ? null : s.nextStepId,
          options: s.options.map((o) => (o.stepId === id ? { ...o, next: "HUMAN" as BotNext, stepId: null } : o)),
        })),
    }));
    setSelected("start");
  };

  const duplicateStep = (id: string) => {
    const s = d.steps.find((x) => x.id === id);
    if (!s) return;
    const copy: BotStep = {
      ...JSON.parse(JSON.stringify(s)),
      id: newId(),
      name: `${s.name} (cópia)`.slice(0, 60),
      pos: { x: (s.pos?.x || 0) + 40, y: (s.pos?.y || 0) + 60 },
    };
    copy.options = copy.options.map((o) => ({ ...o, id: newId() }));
    change((x) => ({ ...x, steps: [...x.steps, copy] }));
    setSelected(copy.id);
  };

  // Delete apaga o bloco selecionado (fora de campos de texto)
  const selRef = useRef(selected);
  selRef.current = selected;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current && selRef.current !== "start") {
        e.preventDefault();
        removeStep(selRef.current);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.steps.length]);

  // Avisa antes de sair com alterações
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const createTag = async (name: string) => {
    const t = await api("/api/chatbot/tags", "POST", { name });
    if (!refs.tags.find((x) => x.id === t.id)) onTagCreated(t);
    return t as TagRef;
  };

  const save = async () => {
    const missing = d.steps.find((s) => stepKind(s) !== "MENU" && !s.media);
    if (missing) {
      setSelected(missing.id);
      setTab("bloco");
      setError(`"${missing.name}": envie o arquivo do bloco (ou exclua o bloco).`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { ...d, steps: d.steps.map((s) => ({ ...s, options: s.options.map((o, i) => ({ ...o, key: String(i + 1) })) })) };
      const r = d.id ? await api(`/api/chatbot/${d.id}`, "PUT", body) : await api("/api/chatbot", "POST", body);
      setDirty(false);
      onSaved(r.bots);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (dirty && !confirm("Sair sem salvar as alterações?")) return;
    onCancel();
  };

  const step = selected && selected !== "start" ? d.steps.find((s) => s.id === selected) || null : null;
  const onActive = useCallback((id: string | null) => setActiveId(id), []);

  return (
    <div className="flex min-h-full flex-col px-3 py-3 md:px-5 md:py-4">
      {/* Barra do topo */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={leave} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <ArrowLeft size={16} /> Chatbots
        </button>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
          <Workflow size={18} />
        </span>
        <input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={120}
          className="min-w-[180px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-[var(--accent)] focus:bg-white"
          placeholder="Nome do chatbot"
        />
        <Toggle checked={d.active} onChange={(v) => set({ active: v })} label={d.active ? "Ativo" : "Desligado"} />
        {dirty && <Badge tone="amber">Não salvo</Badge>}
        <Button variant="secondary" onClick={leave}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar chatbot"}
        </Button>
      </div>
      <ErrorNote message={error} />

      <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="h-[68vh] min-h-[520px] xl:h-[calc(100vh-150px)]">
          <FlowCanvas
            draft={d}
            selected={selected}
            activeId={tab === "testar" ? activeId : null}
            onSelect={(id) => {
              setSelected(id);
              if (id) setTab("bloco");
            }}
            onMove={onMove}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onSetEnd={onSetEnd}
            onCreate={onCreate}
            agents={refs.agents}
            onAutoLayout={() => {
              const pos = autoLayout(d.steps);
              change((x) => ({ ...x, steps: x.steps.map((s) => ({ ...s, pos: pos[s.id] || s.pos })) }));
            }}
          />
        </div>

        {/* Painel da direita */}
        <div className="flex min-h-[520px] flex-col xl:h-[calc(100vh-150px)]">
          <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["bloco", "Editar", Pencil],
                ["testar", "Testar", Play],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tab === k ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className={tab === "testar" ? "min-h-0 flex-1" : "hidden"}>
            <Simulator bot={d} refs={refs} onActive={onActive} />
          </div>
          {tab === "bloco" && (
            <Card className="min-h-0 flex-1 overflow-y-auto p-4">
              {step ? (
                <BlockPanel
                  key={step.id}
                  step={step}
                  steps={d.steps}
                  refs={refs}
                  onChange={(patch) => setStep(step.id, patch)}
                  onRemove={() => removeStep(step.id)}
                  onDuplicate={() => duplicateStep(step.id)}
                  onCreateTag={createTag}
                />
              ) : selected === "start" ? (
                <StartPanel d={d} set={set} refs={refs} onCreateTag={createTag} />
              ) : (
                <div className="grid h-full place-items-center text-center text-sm text-slate-500">
                  <div className="max-w-[260px]">
                    <Info size={24} className="mx-auto mb-2 text-slate-400" />
                    Clique num bloco para editar. Use a barra <b>Adicionar</b> para criar mensagens, fotos, áudios, vídeos e PDFs, e puxe as
                    bolinhas para ligar um no outro.
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
