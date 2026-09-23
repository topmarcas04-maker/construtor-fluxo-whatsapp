"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Workflow,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Tag as TagIcon,
  UserRound,
  Sparkles,
  CircleStop,
  ArrowRight,
  Columns3,
  MessageSquare,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronUp,
  Info,
  Hash,
} from "lucide-react";
import { Page, PageHeader, Card, Button, Field, Input, Select, Textarea, Toggle, Badge, ErrorNote } from "@/components/ui";
import {
  BOT_CHANNELS,
  DEFAULT_FALLBACK,
  NEXT_LABEL,
  TRIGGER_LABEL,
  emptyOption,
  fillBotText,
  matchKeyword,
  matchOption,
  newId,
  renderStep,
  templateSteps,
  triggerSummary,
  type BotNext,
  type BotOption,
  type BotStep,
  type BotTrigger,
  type Chatbot,
} from "@/lib/chatbot/common";

interface TagRef {
  id: string;
  name: string;
  color: string;
}
interface Refs {
  tags: TagRef[];
  sellers: { id: string; name: string }[];
  funnels: { id: string; name: string; columns: { id: string; name: string }[] }[];
  aiEnabled: boolean;
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo deu errado");
  return data;
}

const TAG_TONE: Record<string, string> = {
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  orange: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-600 border-red-200",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
};
const tagTone = (c: string) => TAG_TONE[c] || TAG_TONE.blue;

const NEXT_ICON: Record<BotNext, typeof ArrowRight> = {
  STEP: ArrowRight,
  HUMAN: UserRound,
  AI: Sparkles,
  END: CircleStop,
};

type Draft = Omit<Chatbot, "id" | "sort"> & { id?: string };

function newDraft(): Draft {
  return {
    name: "Menu de atendimento",
    active: true,
    trigger: "START",
    keywords: ["menu"],
    tagIds: [],
    skipTagIds: [],
    channels: ["WHATSAPP", "INSTAGRAM", "MESSENGER"],
    restartHours: 24,
    steps: templateSteps(),
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
  const [refs, setRefs] = useState<Refs>({ tags: [], sellers: [], funnels: [], aiEnabled: false });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api("/api/chatbot", "GET");
    setBots(d.bots);
    setRefs({ tags: d.tags, sellers: d.sellers, funnels: d.funnels, aiEnabled: d.aiEnabled });
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
        description="Menus automáticos sem IA: o cliente responde com o número da opção e o sistema responde, marca etiqueta, move o card ou passa para a equipe. Não gasta créditos de IA."
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
                      {b.steps.length} {b.steps.length === 1 ? "passo" : "passos"} ·{" "}
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
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="ghost" onClick={() => remove(b)} title="Excluir">
                  <Trash2 size={15} />
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
// EDITOR
// ============================================================================

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
  const [d, setD] = useState<Draft>(() => JSON.parse(JSON.stringify(initial)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kw, setKw] = useState("");
  const [open, setOpen] = useState<string | null>(null); // opção aberta

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setStep = (id: string, patch: Partial<BotStep>) =>
    setD((x) => ({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const setOption = (stepId: string, optId: string, patch: Partial<BotOption>) =>
    setD((x) => ({
      ...x,
      steps: x.steps.map((s) =>
        s.id === stepId ? { ...s, options: s.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) } : s
      ),
    }));
  const renumber = (opts: BotOption[]) => opts.map((o, i) => ({ ...o, key: String(i + 1) }));

  const addStep = () => {
    const id = newId();
    setD((x) => ({
      ...x,
      steps: [...x.steps, { id, name: `Passo ${x.steps.length + 1}`, message: "", options: [emptyOption("1")], next: "END" }],
    }));
    return id;
  };
  const removeStep = (id: string) => {
    if (d.steps.length <= 1) return;
    if (!confirm("Excluir este passo? As opções que levavam a ele vão passar para a equipe.")) return;
    setD((x) => ({
      ...x,
      steps: x.steps
        .filter((s) => s.id !== id)
        .map((s) => ({
          ...s,
          options: s.options.map((o) => (o.stepId === id ? { ...o, next: "HUMAN" as BotNext, stepId: null } : o)),
        })),
    }));
  };
  const moveStep = (id: string, dir: -1 | 1) =>
    setD((x) => {
      const i = x.steps.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= x.steps.length) return x;
      const steps = [...x.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...x, steps };
    });

  const createTag = async (name: string) => {
    const t = await api("/api/chatbot/tags", "POST", { name });
    if (!refs.tags.find((x) => x.id === t.id)) onTagCreated(t);
    return t as TagRef;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...d, steps: d.steps.map((s) => ({ ...s, options: renumber(s.options) })) };
      const r = d.id ? await api(`/api/chatbot/${d.id}`, "PUT", body) : await api("/api/chatbot", "POST", body);
      onSaved(r.bots);
    } catch (e) {
      setError((e as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  const columnName = (id: string | null) => {
    for (const f of refs.funnels) {
      const c = f.columns.find((x) => x.id === id);
      if (c) return refs.funnels.length > 1 ? `${f.name} › ${c.name}` : c.name;
    }
    return null;
  };

  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onCancel} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Voltar para a lista
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar chatbot"}
          </Button>
        </div>
      </div>
      <ErrorNote message={error} />

      <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* ---- Básico ---- */}
          <Card className="p-5">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Nome do chatbot" className="min-w-[240px] flex-1">
                <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Menu de atendimento" />
              </Field>
              <div className="pb-2">
                <Toggle checked={d.active} onChange={(v) => set({ active: v })} label={d.active ? "Ativo" : "Desligado"} />
              </div>
            </div>
          </Card>

          {/* ---- Quando começa ---- */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900">Quando o chatbot começa</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["START", "KEYWORD", "TAG"] as BotTrigger[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ trigger: t })}
                  className={`rounded-xl border p-3 text-left transition ${
                    d.trigger === t ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className={`text-sm font-semibold ${d.trigger === t ? "text-[var(--accent)]" : "text-slate-800"}`}>{TRIGGER_LABEL[t]}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t === "START"
                      ? "Lead novo ou que volta depois de um tempo"
                      : t === "KEYWORD"
                      ? "Quando o cliente escreve uma palavra, ex.: menu"
                      : "Quando o lead tem uma etiqueta"}
                  </p>
                </button>
              ))}
            </div>

            {d.trigger === "KEYWORD" && (
              <div className="mt-4">
                <p className="mb-1.5 text-sm font-semibold text-slate-800">Palavras-chave</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.keywords.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
                      {k}
                      <button type="button" onClick={() => set({ keywords: d.keywords.filter((x) => x !== k) })} className="text-slate-400 hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && kw.trim()) {
                        e.preventDefault();
                        if (!d.keywords.includes(kw.trim())) set({ keywords: [...d.keywords, kw.trim()] });
                        setKw("");
                      }
                    }}
                    placeholder="Digite e aperte Enter"
                    className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">Vale a palavra inteira, sem diferença de acento ou maiúscula.</p>
              </div>
            )}

            {d.trigger === "TAG" && (
              <div className="mt-4">
                <p className="mb-1.5 text-sm font-semibold text-slate-800">Começa quando o lead tiver a etiqueta</p>
                <TagPicker tags={refs.tags} value={d.tagIds} onChange={(v) => set({ tagIds: v })} onCreate={createTag} />
                <p className="mt-1 text-xs text-slate-400">
                  Na próxima mensagem do cliente depois de receber a etiqueta (colocada pela equipe, pela IA ou por outro chatbot).
                </p>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Recomeçar depois de" hint="Se o cliente voltar depois desse tempo sem conversa, o menu começa de novo.">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={d.restartHours}
                    onChange={(e) => set({ restartHours: Number(e.target.value) || 1 })}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-[15px] outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-sm text-slate-600">horas</span>
                </div>
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-800">Canais</p>
                <div className="flex flex-wrap gap-3 pt-1.5">
                  {BOT_CHANNELS.map((c) => (
                    <label key={c.key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={d.channels.includes(c.key)}
                        onChange={(e) =>
                          set({ channels: e.target.checked ? [...d.channels, c.key] : d.channels.filter((x) => x !== c.key) })
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-sm font-semibold text-slate-800">Não começar se o lead tiver a etiqueta (opcional)</p>
              <TagPicker tags={refs.tags} value={d.skipTagIds} onChange={(v) => set({ skipTagIds: v })} onCreate={createTag} />
              <p className="mt-1 text-xs text-slate-400">Ex.: &quot;Cliente antigo&quot; ou &quot;Não perturbar&quot;.</p>
            </div>
          </Card>

          {/* ---- Passos ---- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Passos do menu</h3>
              <span className="text-xs text-slate-400">O primeiro passo é o que o cliente recebe ao começar. Use {"{nome}"} para o nome.</span>
            </div>
            {d.steps.map((s, si) => (
              <Card key={s.id} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">{si + 1}</span>
                  <input
                    value={s.name}
                    onChange={(e) => setStep(s.id, { name: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
                  />
                  {si === 0 && <Badge tone="green">Início</Badge>}
                  <button onClick={() => moveStep(s.id, -1)} disabled={si === 0} className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30" title="Subir">
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => moveStep(s.id, 1)}
                    disabled={si === d.steps.length - 1}
                    className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"
                    title="Descer"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button onClick={() => removeStep(s.id)} disabled={d.steps.length <= 1} className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-500 disabled:opacity-30" title="Excluir passo">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="space-y-3 p-4">
                  <Textarea
                    rows={2}
                    value={s.message}
                    onChange={(e) => setStep(s.id, { message: e.target.value })}
                    placeholder="Mensagem deste passo. Ex.: Olá, {nome}! Como podemos ajudar?"
                  />

                  {s.options.length > 0 && (
                    <div className="space-y-2">
                      {s.options.map((o, oi) => {
                        const Icon = NEXT_ICON[o.next];
                        const target = o.next === "STEP" ? d.steps.find((x) => x.id === o.stepId) : null;
                        const isOpen = open === o.id;
                        return (
                          <div key={o.id} className="rounded-xl border border-slate-200">
                            <div className="flex flex-wrap items-center gap-2 p-2">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">{oi + 1}</span>
                              <input
                                value={o.label}
                                onChange={(e) => setOption(s.id, o.id, { label: e.target.value })}
                                placeholder="Texto da opção. Ex.: Quero comprar"
                                className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                              />
                              <select
                                value={o.next === "STEP" ? `STEP:${o.stepId || ""}` : o.next}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "NEWSTEP") {
                                    const id = addStep();
                                    setOption(s.id, o.id, { next: "STEP", stepId: id });
                                  } else if (v.startsWith("STEP:")) setOption(s.id, o.id, { next: "STEP", stepId: v.slice(5) });
                                  else setOption(s.id, o.id, { next: v as BotNext, stepId: null });
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-[var(--accent)]"
                              >
                                <optgroup label="Depois">
                                  {d.steps
                                    .filter((x) => x.id !== s.id)
                                    .map((x) => (
                                      <option key={x.id} value={`STEP:${x.id}`}>
                                        → Passo {d.steps.indexOf(x) + 1}: {x.name}
                                      </option>
                                    ))}
                                  <option value="NEWSTEP">+ Criar novo passo</option>
                                  <option value="HUMAN">Passar para a equipe</option>
                                  <option value="AI">Passar para a IA</option>
                                  <option value="END">Encerrar</option>
                                </optgroup>
                              </select>
                              <button
                                type="button"
                                onClick={() => setOpen(isOpen ? null : o.id)}
                                className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${isOpen ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                              >
                                Mais ações
                              </button>
                              <button
                                type="button"
                                onClick={() => setStep(s.id, { options: renumber(s.options.filter((x) => x.id !== o.id)) })}
                                className="rounded p-1.5 text-slate-400 hover:text-red-500"
                                title="Excluir opção"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            {/* Resumo do que acontece */}
                            <div className="flex flex-wrap gap-1.5 px-3 pb-2 pl-12 text-[11px]">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                <Icon size={11} /> {o.next === "STEP" ? `Passo ${d.steps.indexOf(target!) + 1}` : NEXT_LABEL[o.next]}
                              </span>
                              {o.reply && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-700">
                                  <MessageSquare size={11} /> responde
                                </span>
                              )}
                              {o.addTagIds.map((t) => (
                                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">
                                  <TagIcon size={11} /> {refs.tags.find((x) => x.id === t)?.name}
                                </span>
                              ))}
                              {o.columnId && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                                  <Columns3 size={11} /> {columnName(o.columnId)}
                                </span>
                              )}
                              {o.sellerId && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                                  <UserRound size={11} />{" "}
                                  {o.sellerId === "AUTO" ? "Distribuição" : refs.sellers.find((x) => x.id === o.sellerId)?.name}
                                </span>
                              )}
                            </div>
                            {isOpen && (
                              <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2">
                                <Field label="Responder" className="sm:col-span-2" hint="Mensagem enviada quando o cliente escolhe esta opção (opcional).">
                                  <Textarea rows={2} value={o.reply} onChange={(e) => setOption(s.id, o.id, { reply: e.target.value })} />
                                </Field>
                                <div className="sm:col-span-2">
                                  <p className="mb-1.5 text-sm font-semibold text-slate-800">Colocar etiqueta</p>
                                  <TagPicker tags={refs.tags} value={o.addTagIds} onChange={(v) => setOption(s.id, o.id, { addTagIds: v })} onCreate={createTag} />
                                </div>
                                <div className="sm:col-span-2">
                                  <p className="mb-1.5 text-sm font-semibold text-slate-800">Tirar etiqueta</p>
                                  <TagPicker tags={refs.tags} value={o.removeTagIds} onChange={(v) => setOption(s.id, o.id, { removeTagIds: v })} />
                                </div>
                                <Field label="Mover o card para">
                                  <Select value={o.columnId || ""} onChange={(e) => setOption(s.id, o.id, { columnId: e.target.value || null })}>
                                    <option value="">Não mover</option>
                                    {refs.funnels.map((f) => (
                                      <optgroup key={f.id} label={`Funil ${f.name}`}>
                                        {f.columns.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </Select>
                                </Field>
                                <Field label="Vendedor">
                                  <Select value={o.sellerId || ""} onChange={(e) => setOption(s.id, o.id, { sellerId: e.target.value || null })}>
                                    <option value="">Não definir</option>
                                    <option value="AUTO">Pelas regras de distribuição</option>
                                    {refs.sellers.map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => s.options.length < 10 && setStep(s.id, { options: [...s.options, emptyOption(String(s.options.length + 1))] })}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline"
                    >
                      <Plus size={15} /> Adicionar opção
                    </button>
                    {s.options.length === 0 && (
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                        Sem opções — depois da mensagem:
                        <select
                          value={s.next}
                          onChange={(e) => setStep(s.id, { next: e.target.value as BotStep["next"] })}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="END">Encerrar</option>
                          <option value="HUMAN">Passar para a equipe</option>
                          <option value="AI">Passar para a IA</option>
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            <Button variant="secondary" onClick={() => addStep()}>
              <Plus size={15} /> Novo passo
            </Button>
          </div>

          {/* ---- Quando não entende ---- */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900">Quando o cliente responde algo que não é uma opção</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_140px_220px]">
              <Field label="Mensagem" hint="Depois dela o menu é mostrado de novo.">
                <Input value={d.fallbackMessage || ""} onChange={(e) => set({ fallbackMessage: e.target.value })} placeholder={DEFAULT_FALLBACK} />
              </Field>
              <Field label="Tentativas">
                <Select value={String(d.maxTries)} onChange={(e) => set({ maxTries: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Depois das tentativas">
                <Select value={d.afterFail} onChange={(e) => set({ afterFail: e.target.value as Draft["afterFail"] })}>
                  <option value="HUMAN">Passar para a equipe</option>
                  <option value="AI">Passar para a IA</option>
                  <option value="END">Encerrar</option>
                </Select>
              </Field>
            </div>
          </Card>
        </div>

        {/* ---- Teste ---- */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Simulator bot={d} refs={refs} />
        </div>
      </div>
    </Page>
  );
}

// ============================================================================
// ETIQUETAS
// ============================================================================

function TagPicker({
  tags,
  value,
  onChange,
  onCreate,
}: {
  tags: TagRef[];
  value: string[];
  onChange: (v: string[]) => void;
  onCreate?: (name: string) => Promise<TagRef>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              on ? tagTone(t.color) + " ring-2 ring-offset-1 ring-[var(--accent)]/30" : "border-slate-200 bg-white text-slate-400 hover:text-slate-600"
            }`}
          >
            <TagIcon size={11} /> {t.name}
          </button>
        );
      })}
      {tags.length === 0 && !onCreate && <span className="text-xs text-slate-400">Nenhuma etiqueta criada.</span>}
      {onCreate && (
        <span className="inline-flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && name.trim()) {
                e.preventDefault();
                setBusy(true);
                try {
                  const t = await onCreate(name.trim());
                  if (!value.includes(t.id)) onChange([...value, t.id]);
                  setName("");
                } finally {
                  setBusy(false);
                }
              }
            }}
            disabled={busy}
            placeholder="+ nova etiqueta"
            className="w-32 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
        </span>
      )}
    </div>
  );
}

// ============================================================================
// SIMULADOR
// ============================================================================

type Line = { from: "bot" | "lead" | "sys"; text: string };

function Simulator({ bot, refs }: { bot: Draft; refs: Refs }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [stepId, setStepId] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [ended, setEnded] = useState(false);
  const [text, setText] = useState("");
  const [started, setStarted] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const vars = { nome: "Maria" };

  const tagName = (id: string) => refs.tags.find((t) => t.id === id)?.name || "etiqueta";
  const colName = (id: string) => {
    for (const f of refs.funnels) {
      const c = f.columns.find((x) => x.id === id);
      if (c) return c.name;
    }
    return "coluna";
  };
  const finish = (next: Exclude<BotNext, "STEP">, out: Line[]) => {
    out.push({
      from: "sys",
      text:
        next === "HUMAN"
          ? "👤 Passado para a equipe — o chatbot para aqui"
          : next === "AI"
          ? refs.aiEnabled
            ? "✨ Passado para a IA — ela continua a conversa"
            : "✨ Passaria para a IA (a IA desta conta está desligada)"
          : "⏹ Chatbot encerrado",
    });
    setEnded(true);
    setStepId(null);
  };
  const enter = (id: string, out: Line[]) => {
    const s = bot.steps.find((x) => x.id === id);
    if (!s) return finish("HUMAN", out);
    out.push({ from: "bot", text: renderStep(s, vars) });
    if (!s.options.length) return finish(s.next, out);
    setStepId(s.id);
    setTries(0);
  };

  const start = () => {
    const out: Line[] = [];
    setEnded(false);
    setStarted(true);
    if (bot.trigger === "KEYWORD") out.push({ from: "lead", text: bot.keywords[0] || "menu" });
    else if (bot.trigger === "TAG") out.push({ from: "sys", text: `🏷 Lead com a etiqueta ${bot.tagIds.map(tagName).join(", ") || "—"}` }, { from: "lead", text: "Oi" });
    else out.push({ from: "lead", text: "Oi, boa tarde!" });
    if (bot.steps[0]) enter(bot.steps[0].id, out);
    setLines(out);
  };

  const answer = (value: string) => {
    if (!value.trim() || ended || !stepId) return;
    const s = bot.steps.find((x) => x.id === stepId);
    if (!s) return;
    const out: Line[] = [{ from: "lead", text: value }];
    const o = matchOption(s.options, value);
    if (!o) {
      const n = tries + 1;
      if (n > bot.maxTries) {
        if (bot.afterFail === "HUMAN") out.push({ from: "bot", text: "Tudo bem! Vou chamar alguém da equipe para te ajudar. 🙂" });
        finish(bot.afterFail, out);
      } else {
        setTries(n);
        out.push({ from: "bot", text: `${bot.fallbackMessage || DEFAULT_FALLBACK}\n\n${s.options.map((x) => `*${x.key}* - ${x.label}`).join("\n")}` });
      }
    } else {
      if (o.reply) out.push({ from: "bot", text: fillBotText(o.reply, vars) });
      o.addTagIds.forEach((t) => out.push({ from: "sys", text: `🏷 Etiqueta "${tagName(t)}" colocada` }));
      o.removeTagIds.forEach((t) => out.push({ from: "sys", text: `🏷 Etiqueta "${tagName(t)}" retirada` }));
      if (o.columnId) out.push({ from: "sys", text: `📋 Card movido para ${colName(o.columnId)}` });
      if (o.sellerId)
        out.push({
          from: "sys",
          text: `👤 Vendedor: ${o.sellerId === "AUTO" ? "pelas regras de distribuição" : refs.sellers.find((x) => x.id === o.sellerId)?.name || "—"}`,
        });
      if (o.next === "STEP" && o.stepId) enter(o.stepId, out);
      else finish(o.next === "STEP" ? "HUMAN" : o.next, out);
    }
    setLines((l) => [...l, ...out]);
  };

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const current = useMemo(() => bot.steps.find((x) => x.id === stepId), [bot.steps, stepId]);
  const keywordHint = bot.trigger === "KEYWORD" && bot.keywords.length > 0 && matchKeyword(bot.keywords, bot.keywords[0]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-900">Testar</p>
          <p className="text-xs text-slate-500">Simulação — nada é enviado ao cliente</p>
        </div>
        <Button variant="secondary" onClick={start} className="!px-3 !py-1.5">
          <RotateCcw size={14} /> {started ? "Recomeçar" : "Começar"}
        </Button>
      </div>
      <div ref={scroll} className="h-[440px] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {!started && (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            <div>
              <Workflow size={28} className="mx-auto mb-2 text-slate-400" />
              Clique em <b>Começar</b> para ver como o cliente recebe o menu.
              {keywordHint ? <p className="mt-1 text-xs">(simula o cliente escrevendo &quot;{bot.keywords[0]}&quot;)</p> : null}
            </div>
          </div>
        )}
        {lines.map((l, i) =>
          l.from === "sys" ? (
            <p key={i} className="mx-auto w-fit rounded-lg bg-amber-50 px-2.5 py-1 text-center text-[11px] font-semibold text-amber-800">
              {l.text}
            </p>
          ) : (
            <div key={i} className={`flex ${l.from === "bot" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] shadow-sm ${
                  l.from === "bot" ? "rounded-br-md bg-teal-600 text-white" : "rounded-bl-md bg-white text-slate-800"
                }`}
              >
                {l.from === "bot" && (
                  <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-white/75">
                    <Workflow size={10} /> Chatbot
                  </p>
                )}
                {waBold(l.text)}
              </div>
            </div>
          )
        )}
      </div>
      {current && !ended && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 pt-2.5">
          {current.options.map((o) => (
            <button
              key={o.id}
              onClick={() => answer(o.key)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Hash size={11} />
              {o.key} {o.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          answer(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!current || ended}
          placeholder={ended ? "Chatbot encerrado — clique em Recomeçar" : "Responda como o cliente..."}
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-slate-50"
        />
        <button type="submit" disabled={!current || ended} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-white disabled:opacity-40">
          <Send size={15} />
        </button>
      </form>
    </Card>
  );
}

/** *negrito* do WhatsApp */
function waBold(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>
  );
}
