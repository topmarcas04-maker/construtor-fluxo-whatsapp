"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Plus, Pencil, Copy, Trash2, MessageCircleMore, Crown, Package, ListChecks, ShieldCheck, Smartphone, ArrowLeft, Check, Route, Users, Power, LayoutTemplate, RefreshCw } from "lucide-react";
import { Page, PageHeader, Card, Badge, Button, Field, Input, Textarea, Toggle, ErrorNote, EmptyState } from "@/components/ui";
import { StyleCard, AiTester } from "@/components/settings/AiStyle";
import { QualifyCard } from "@/components/settings/QualifyCard";
import { AGENT_ROLES, AGENT_INTENTS, PERMISSION_LIST, ALL_PERMISSIONS, EMPTY_ROUTING, roleLabel, type AgentProfile } from "@/lib/agents/common";
import { DEFAULT_QUALIFY, normalizeQualify } from "@/lib/ai/qualify";
import { AgentsReport } from "@/components/agents/AgentsReport";

type AgentRow = AgentProfile & { conversations: number; channels: string[] };

interface TemplateOption {
  id: string;
  name: string;
  role: string;
  description: string | null;
  hasCopy: boolean;
}

interface Data {
  aiEnabled?: boolean;
  agents: AgentRow[];
  limit: number;
  activeCount?: number;
  templates?: TemplateOption[];
  options: {
    products: { id: string; name: string; categoryId: string | null; active: boolean }[];
    categories: { id: string; name: string }[];
    actions: { id: string; name: string; active: boolean }[];
  };
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo deu errado");
  return data;
}

const NEW_AGENT: Omit<AgentProfile, "id"> = {
  name: "",
  role: "VENDAS",
  roleCustom: null,
  objective: AGENT_ROLES.find((r) => r.key === "VENDAS")!.objective,
  description: null,
  instructions: "",
  style: "FRIENDLY",
  styleCustom: null,
  replyLength: "MEDIUM",
  emojiLevel: "LOW",
  offerVideo: true,
  qualify: null,
  productIds: [],
  categoryIds: [],
  actionIds: [],
  permissions: ALL_PERMISSIONS,
  routing: EMPTY_ROUTING,
  isPrimary: false,
  active: true,
};

function Chips({ items, selected, onToggle, empty }: { items: { id: string; name: string; active?: boolean }[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  if (!items.length) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-500 hover:border-slate-300"
            } ${it.active === false ? "opacity-50" : ""}`}
          >
            {it.name}
          </button>
        );
      })}
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Bot; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <Icon size={17} /> {title}
      </p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Cadastro / edição de um agente */
function AgentEditor({
  initial,
  data,
  onClose,
  onSaved,
  focusTest,
  mode = "agent",
}: {
  initial: AgentProfile | null;
  data: Data;
  onClose: () => void;
  onSaved: (d: Data) => void;
  focusTest?: boolean;
  /** template = modelo do Master (sem produtos, ações, palavras-chave e teste) */
  mode?: "agent" | "template";
}) {
  const isTemplate = mode === "template";
  const [a, setA] = useState<Omit<AgentProfile, "id"> & { id?: string }>(initial || NEW_AGENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const testRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusTest) testRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [focusTest]);

  const set = (patch: Partial<AgentProfile>) => {
    setSaved(false);
    setA((x) => ({ ...x, ...patch }));
  };
  const toggleId = (key: "productIds" | "categoryIds" | "actionIds", id: string) =>
    set({ [key]: a[key].includes(id) ? a[key].filter((v) => v !== id) : [...a[key], id] } as Partial<AgentProfile>);

  const save = async (extra?: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const base = isTemplate ? "/api/agent-templates" : "/api/agents";
      const raw = a.id ? await api(`${base}/${a.id}`, "PATCH", { ...a, ...extra }) : await api(base, "POST", a);
      const d: Data & { id?: string } = isTemplate ? { ...data, agents: raw.templates, id: raw.id } : raw;
      onSaved(d);
      if (!a.id && d.id) setA((x) => ({ ...x, id: d.id }));
      if (extra?.makePrimary) setA((x) => ({ ...x, isPrimary: true, active: true }));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const msg = isTemplate
      ? `Excluir o modelo "${a.name}"? Os agentes que as contas já receberam continuam funcionando, só perdem o "Atualizar do modelo".`
      : `Excluir o agente "${a.name}"? As conversas dele passam para o Agente Principal.`;
    if (!a.id || !confirm(msg)) return;
    try {
      const raw = await api(`${isTemplate ? "/api/agent-templates" : "/api/agents"}/${a.id}`, "DELETE");
      onSaved(isTemplate ? { ...data, agents: raw.templates } : raw);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const qualify = normalizeQualify(a.qualify ?? DEFAULT_QUALIFY);
  const routing = a.routing || EMPTY_ROUTING;
  const setRouting = (patch: Partial<typeof routing>) => set({ routing: { ...routing, ...patch } });
  const others = data.agents.filter((x) => x.id !== a.id);
  const [kwText, setKwText] = useState((a.routing || EMPTY_ROUTING).keywords.join(", "));
  const prodsByCat = data.options.products;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Voltar para a lista
        </button>
        <div className="flex items-center gap-2">
          {isTemplate ? (
            <Badge tone="blue">Modelo</Badge>
          ) : a.isPrimary ? (
            <Badge tone="purple">Agente Principal</Badge>
          ) : (
            a.id && (
              <Button variant="secondary" onClick={() => save({ makePrimary: true })} disabled={saving}>
                <Crown size={15} /> Tornar principal
              </Button>
            )
          )}
          {a.id && !a.isPrimary && (
            <Button variant="danger" onClick={remove}>
              <Trash2 size={15} /> Excluir
            </Button>
          )}
        </div>
      </div>

      <Section icon={Bot} title="Identidade do agente">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" hint='Ex.: "SDR Comercial", "Pós-venda", "Recepção".'>
            <Input value={a.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Função">
            <select
              value={a.role}
              onChange={(e) => {
                const role = AGENT_ROLES.find((r) => r.key === e.target.value)!;
                const oldDefault = AGENT_ROLES.find((r) => r.key === a.role)?.objective || "";
                set({ role: role.key, objective: !a.objective || a.objective === oldDefault ? role.objective : a.objective });
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[var(--accent)]"
            >
              {AGENT_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            {a.role === "CUSTOM" && (
              <Input className="mt-2" placeholder="Nome da função" value={a.roleCustom || ""} maxLength={60} onChange={(e) => set({ roleCustom: e.target.value })} />
            )}
          </Field>
          <Field label="Objetivo" hint="O que este agente precisa alcançar em cada conversa." className="md:col-span-2">
            <Input value={a.objective || ""} maxLength={1000} onChange={(e) => set({ objective: e.target.value })} />
          </Field>
          <Field label="Descrição (só para a equipe)" className="md:col-span-2">
            <Input value={a.description || ""} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          {!a.isPrimary && (
            <div>
              <Toggle
                checked={a.active}
                onChange={(v) => set({ active: v })}
                label={isTemplate ? (a.active ? "Disponível para liberar" : "Indisponível") : a.active ? "Ativo" : "Desativado"}
              />
            </div>
          )}
        </div>
      </Section>

      <Section
        icon={MessageCircleMore}
        title="Instruções do Agente"
        hint="Como conversar, o que ele sabe, regras comerciais, o que pode e não pode falar, quando perguntar dados e quando chamar um humano."
      >
        <Textarea rows={12} value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </Section>

      <StyleCard
        v={{ style: a.style, styleCustom: a.styleCustom, replyLength: a.replyLength, emojiLevel: a.emojiLevel, replySpeed: "NATURAL" }}
        onChange={(patch) => set(patch as Partial<AgentProfile>)}
        hideSpeed
      />

      <QualifyCard q={qualify} onChange={(q) => set({ qualify: q })} />

      {!isTemplate && (
      <>
      <Section icon={Package} title="Produtos que o agente conhece" hint="Nenhum marcado = todos os produtos da conta. Marcando uma categoria, ele conhece todos os produtos dela.">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Categorias</p>
        <Chips items={data.options.categories} selected={a.categoryIds} onToggle={(id) => toggleId("categoryIds", id)} empty="Nenhuma categoria cadastrada." />
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos</p>
        <Chips items={prodsByCat} selected={a.productIds} onToggle={(id) => toggleId("productIds", id)} empty="Nenhum produto cadastrado." />
      </Section>

      <Section icon={ListChecks} title="Ações do Agente" hint="Procedimentos que ele pode executar (agendar, ligação, reserva...). Nenhuma marcada = todas as ações ativas.">
        <Chips items={data.options.actions} selected={a.actionIds} onToggle={(id) => toggleId("actionIds", id)} empty="Nenhuma ação cadastrada (Configurações → Ações do Agente)." />
      </Section>
      </>
      )}
      {isTemplate && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          Produtos, ações, palavras-chave e números são escolhidos por cada conta que receber este modelo.
        </p>
      )}

      <Section
        icon={Route}
        title="Quando este agente entra na conversa"
        hint="O roteador e os outros agentes usam isto para saber quando passar a conversa para ele."
      >
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Assuntos que ele atende</p>
        <Chips
          items={AGENT_INTENTS.map((i) => ({ id: i.key, name: i.label }))}
          selected={routing.intents}
          onToggle={(k) => setRouting({ intents: routing.intents.includes(k) ? routing.intents.filter((x) => x !== k) : [...routing.intents, k] })}
          empty=""
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Quando passar para ele (em palavras)" hint='Ex.: "clientes que já compraram e precisam de revisão ou peça".'>
            <Input value={routing.hint} maxLength={500} onChange={(e) => setRouting({ hint: e.target.value })} />
          </Field>
          {!isTemplate && (
          <Field label="Palavras-chave da 1ª mensagem (campanhas)" hint='Separe por vírgula. Ex.: a frase do anúncio "Quero a Eko 10". A conversa já começa com ele.'>
            <Input
              value={kwText}
              onChange={(e) => {
                setKwText(e.target.value);
                setRouting({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) });
              }}
            />
          </Field>
          )}
        </div>
        {a.isPrimary && (
          <div className="mt-4 rounded-lg bg-violet-50/70 p-3">
            <Toggle checked={routing.router} onChange={(v) => setRouting({ router: v })} label="Agente Principal encaminha as conversas novas" />
            <p className="mt-1 text-xs text-slate-500">
              Na primeira mensagem de uma conversa nova, ele entende o que o cliente quer e passa para o agente certo (usa uma chamada curta de IA, só no
              começo). Desligado, ele mesmo atende e só transfere quando precisar.
            </p>
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Users size={13} /> Pode transferir para
            </p>
            <Chips
              items={others.map((o) => ({ id: o.id, name: o.name, active: o.active }))}
              selected={routing.transferTo}
              onToggle={(id) => setRouting({ transferTo: routing.transferTo.includes(id) ? routing.transferTo.filter((x) => x !== id) : [...routing.transferTo, id] })}
              empty=""
            />
            <p className="mt-1 text-[11px] text-slate-400">Nenhum marcado = pode transferir para qualquer agente ativo (se a permissão "Transferir para agente" estiver ligada).</p>
          </div>
        )}
      </Section>

      <Section icon={ShieldCheck} title="Permissões" hint="O agente só faz o que estiver ligado aqui.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERMISSION_LIST.map((p) => (
            <div key={p.key} className="rounded-lg border border-slate-100 p-3">
              <Toggle checked={a.permissions[p.key]} onChange={(v) => set({ permissions: { ...a.permissions, [p.key]: v } })} label={p.label} />
              <p className="mt-1 text-[11px] text-slate-400">{p.hint}</p>
            </div>
          ))}
          <div className="rounded-lg border border-slate-100 p-3">
            <Toggle checked={a.offerVideo} onChange={(v) => set({ offerVideo: v })} label="Oferecer vídeo" />
            <p className="mt-1 text-[11px] text-slate-400">Pergunta se o cliente quer ver o vídeo do produto.</p>
          </div>
        </div>
      </Section>

      {!isTemplate && (
        <div ref={testRef}>
          <AiTester draft={{}} agent={a as unknown as Record<string, unknown>} />
        </div>
      )}

      <ErrorNote message={error} />
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
            <Check size={15} /> Salvo
          </span>
        )}
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        <Button onClick={() => save()} disabled={saving}>
          {saving ? "Salvando..." : a.id ? (isTemplate ? "Salvar modelo" : "Salvar agente") : isTemplate ? "Criar modelo" : "Criar agente"}
        </Button>
      </div>
    </div>
  );
}

export function AgentsScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ agent: AgentProfile | null; test?: boolean; mode?: "agent" | "template" } | null>(null);
  const [tab, setTab] = useState<"agentes" | "modelos" | "relatorios">("agentes");
  const [switching, setSwitching] = useState(false);
  // Modelos (só o Master edita)
  const [tpl, setTpl] = useState<{ canManage: boolean; templates: AgentRow[] }>({ canManage: false, templates: [] });

  const load = useCallback(async () => {
    try {
      setData(await api("/api/agents", "GET"));
    } catch (e) {
      setError((e as Error).message);
    }
    api("/api/agent-templates", "GET")
      .then((r) => setTpl({ canManage: Boolean(r.canManage), templates: r.templates || [] }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Page>{error ? <ErrorNote message={error} /> : <p className="p-6 text-sm text-slate-400">Carregando...</p>}</Page>;

  const activeCount = data.activeCount ?? data.agents.filter((x) => x.active).length;
  const full = data.agents.length >= 30;
  const slotsFull = activeCount >= data.limit;
  const available = (data.templates || []).filter((t) => !t.hasCopy);

  const addFromTemplate = async (id: string) => {
    setError(null);
    try {
      setData(await api("/api/agents", "POST", { fromTemplateId: id }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const syncTemplate = async (ag: AgentRow) => {
    if (
      !confirm(
        `Atualizar "${ag.name}" com a versão atual do modelo?\n\nTraz instruções, estilo, qualificação, permissões e assuntos do modelo. Mantém os produtos, as ações, as palavras-chave, o nome e se está ativo. O que você mudou nas instruções será substituído.`
      )
    )
      return;
    setError(null);
    try {
      setData(await api(`/api/agents/${ag.id}/sync-template`, "POST"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggleTemplate = async (t: AgentRow) => {
    setError(null);
    try {
      const r = await api(`/api/agent-templates/${t.id}`, "PATCH", { active: !t.active });
      setTpl({ canManage: true, templates: r.templates });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const duplicate = async (id: string) => {
    setError(null);
    try {
      setData(await api("/api/agents", "POST", { duplicateFrom: id }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setAiEnabled = async (enabled: boolean) => {
    setError(null);
    setSwitching(true);
    try {
      setData(await api("/api/agents/enabled", "PATCH", { enabled }));
    } catch (e) {
      setError((e as Error).message);
    }
    setSwitching(false);
  };
  const toggleActive = async (ag: AgentRow) => {
    setError(null);
    try {
      setData(await api(`/api/agents/${ag.id}`, "PATCH", { active: !ag.active }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (editing) {
    return (
      <Page>
        {editing.mode === "template" ? (
          <PageHeader
            title={editing.agent ? `Modelo: ${editing.agent.name}` : "Novo modelo de agente"}
            description="Modelo pronto que você libera para parceiros e clientes. Eles recebem uma cópia desativada e ajustam aos produtos deles."
          />
        ) : (
          <PageHeader title={editing.agent ? `Configurar Agente: ${editing.agent.name}` : "Novo Agente"} description="Cada agente tem função, instruções, qualificação, produtos e permissões próprias." />
        )}
        <AgentEditor
          key={(editing.mode || "agent") + (editing.agent?.id || "novo")}
          mode={editing.mode}
          initial={editing.agent}
          data={editing.mode === "template" ? { ...data, agents: tpl.templates } : data}
          focusTest={editing.test}
          onClose={() => {
            setEditing(null);
            if (editing.mode === "template") load();
          }}
          onSaved={(d) =>
            editing.mode === "template"
              ? setTpl({ canManage: true, templates: d.agents })
              : setData((prev) => ({ ...(prev || {}), ...d }))
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Agentes de IA"
        description="Chatbot responde. Agente de IA trabalha. Monte sua equipe: cada agente tem sua função, instruções e permissões, e todos podem trabalhar no mesmo WhatsApp."
        actions={
          <Button onClick={() => setEditing({ agent: null })} disabled={full} title={full ? "Limite do plano atingido" : undefined}>
            <Plus size={15} /> Novo Agente
          </Button>
        }
      />
      <div className="mb-4 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["agentes", "Agentes"],
            ...(tpl.canManage ? ([["modelos", "Modelos"]] as const) : []),
            ["relatorios", "Relatórios e consumo"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "relatorios" ? (
        <AgentsReport />
      ) : tab === "modelos" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              Modelos prontos para liberar em <b>Contas → editar → Modelos de agentes</b>. Cada conta recebe uma cópia <b>desativada</b>, ajusta aos
              produtos e à estratégia dela e ativa conforme o limite do plano. Quando você melhorar um modelo, as contas usam &quot;Atualizar do modelo&quot;.
            </p>
            <Button onClick={() => setEditing({ agent: null, mode: "template" })}>
              <Plus size={15} /> Novo modelo
            </Button>
          </div>
          <ErrorNote message={error} />
          <div className="grid gap-4 lg:grid-cols-2">
            {tpl.templates.map((t) => (
              <Card key={t.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.active ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-400"}`}>
                      <LayoutTemplate size={22} />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-sm text-slate-500">{roleLabel(t.role, t.roleCustom)}</p>
                    </div>
                  </div>
                  {t.active ? <Badge tone="blue">Disponível</Badge> : <Badge tone="gray">Indisponível</Badge>}
                </div>
                {(t.description || t.objective) && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{t.description || t.objective}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <Button variant="secondary" onClick={() => setEditing({ agent: t, mode: "template" })}>
                    <Pencil size={14} /> Editar
                  </Button>
                  <div className="ml-auto">
                    <Toggle checked={t.active} onChange={() => toggleTemplate(t)} label={t.active ? "Disponível" : "Indisponível"} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
      <>
      {data.aiEnabled ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Power size={16} /> Atendimento automático ligado: os agentes ativos respondem no WhatsApp.
          </p>
          <Button variant="secondary" onClick={() => setAiEnabled(false)} disabled={switching}>
            {switching ? "..." : "Desligar"}
          </Button>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Power size={16} /> Atendimento automático desligado
            </p>
            <p className="text-xs text-amber-800">Nenhum agente responde no WhatsApp, mesmo os que estão "Ativo". O teste aqui na tela continua funcionando.</p>
          </div>
          <Button onClick={() => setAiEnabled(true)} disabled={switching}>
            {switching ? "Ligando..." : "Ligar atendimento"}
          </Button>
        </div>
      )}
      <p className="mb-4 text-sm text-slate-500">
        {activeCount} de {data.limit} agente{data.limit > 1 ? "s" : ""} ativo{data.limit > 1 ? "s" : ""} no seu plano
        {data.agents.length > activeCount && ` (${data.agents.length - activeCount} desativado${data.agents.length - activeCount > 1 ? "s" : ""})`}.
        {slotsFull && data.limit < 20 && " Para ativar mais, desative outro ou fale com quem administra a sua conta."}
      </p>
      <ErrorNote message={error} />

      {!data.agents.length ? (
        <EmptyState title="Nenhum agente ainda" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.agents.map((ag) => (
            <Card key={ag.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${ag.active ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-400"}`}>
                    <Bot size={22} />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{ag.name}</p>
                    <p className="text-sm text-slate-500">{roleLabel(ag.role, ag.roleCustom)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {ag.templateId && <Badge tone="blue">Modelo</Badge>}
                  {ag.isPrimary && <Badge tone="purple">Principal</Badge>}
                  {ag.active ? <Badge tone="green">Ativo</Badge> : <Badge tone="gray">Desativado</Badge>}
                </div>
              </div>
              {(ag.objective || ag.description) && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{ag.description || ag.objective}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  <Smartphone size={12} /> {ag.channels.length ? ag.channels.join(", ") : ag.isPrimary ? "Todos os números sem agente próprio" : "Nenhum número vinculado"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  <Package size={12} />{" "}
                  {ag.productIds.length || ag.categoryIds.length
                    ? [ag.categoryIds.length ? `${ag.categoryIds.length} categoria(s)` : null, ag.productIds.length ? `${ag.productIds.length} produto(s)` : null].filter(Boolean).join(" + ")
                    : "Todos os produtos"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  <ListChecks size={12} /> {ag.actionIds.length ? `${ag.actionIds.length} ação(ões)` : "Todas as ações"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  <MessageCircleMore size={12} /> {ag.conversations} conversa{ag.conversations === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Button variant="secondary" onClick={() => setEditing({ agent: ag })}>
                  <Pencil size={14} /> Editar
                </Button>
                <Button variant="secondary" onClick={() => setEditing({ agent: ag, test: true })}>
                  <MessageCircleMore size={14} /> Testar
                </Button>
                <Button variant="ghost" onClick={() => duplicate(ag.id)} disabled={full} title={full ? "Limite de agentes atingido" : "Duplicar"}>
                  <Copy size={14} /> Duplicar
                </Button>
                {ag.templateId && (data.templates || []).some((t) => t.id === ag.templateId) && (
                  <Button variant="ghost" onClick={() => syncTemplate(ag)} title="Trazer as melhorias do modelo">
                    <RefreshCw size={14} /> Atualizar do modelo
                  </Button>
                )}
                {!ag.isPrimary && (
                  <div className="ml-auto">
                    <Toggle checked={ag.active} onChange={() => toggleActive(ag)} label={ag.active ? "Ativo" : "Desativado"} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <LayoutTemplate size={16} /> Modelos prontos disponíveis
          </p>
          <p className="mb-3 text-xs text-slate-500">Adicione um modelo: ele entra desativado para você ajustar aos seus produtos antes de ativar.</p>
          <div className="flex flex-wrap gap-2">
            {available.map((t) => (
              <Button key={t.id} variant="secondary" onClick={() => addFromTemplate(t.id)} disabled={full} title={t.description || undefined}>
                <Plus size={14} /> {t.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {data.agents.filter((x) => x.active).length > 1 && (
        <div className="mt-6">
          <AiTester draft={{}} flow />
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Qual agente atende cada WhatsApp você escolhe em WhatsApp → Regras deste número. Sem escolha, quem atende é o Agente Principal. A chave de IA, o modelo, o
        horário dos vendedores e a mensagem de transferência ficam em Configurações → Agentes de IA e valem para todos.
      </p>
      </>
      )}
    </Page>
  );
}
