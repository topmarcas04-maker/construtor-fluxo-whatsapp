"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Trash2, Plus, Check, Pencil } from "lucide-react";
import type { QuickReply, Seller, Tag } from "@/lib/types/sdr";
import { TAG_COLOR_CLASSES, TAG_DOT_CLASSES, SALE_TYPE_LABEL } from "@/lib/types/sdr";
import {
  Page,
  PageHeader,
  Card,
  Tabs,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
  Badge,
  EmptyState,
  ErrorNote,
} from "@/components/ui";

type TabKey = "ia" | "vendedores" | "distribuicao" | "etiquetas" | "respostas";

interface Rule {
  id: string;
  region: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  priority: number;
  active: boolean;
  seller: Seller;
}

interface AiSettings {
  systemPrompt: string;
  enabled: boolean;
  model: string;
  handoffMessage: string;
  notifySeller: boolean;
}

const MODELS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — equilibrado (recomendado)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 — mais rápido e barato" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 — mais inteligente, mais caro" },
];

const TAG_COLORS = ["blue", "green", "orange", "red", "purple", "gray"];

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

// ---------------------------------------------------------------------------
function AiTab() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/sdr/settings").then((r) => r.json()).then(setS);
    fetch("/api/sdr/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setAiReady(d.error ? null : Boolean(d.aiReady)))
      .catch(() => {});
  }, []);

  if (!s) return <p className="p-6 text-sm text-slate-400">Carregando...</p>;

  const save = async (patch?: Partial<AiSettings>) => {
    setSaving(true);
    setError(null);
    try {
      const next = { ...s, ...patch };
      await api("/api/sdr/settings", "PUT", next);
      setS(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isCustomModel = !MODELS.some((m) => m.value === s.model);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-violet-100 bg-violet-50/60 p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
            <Bot size={26} />
          </span>
          <div>
            <p className="font-semibold text-slate-900">Atendimento automático com IA</p>
            <p className="text-sm text-slate-600">
              A IA responde cada nova mensagem, descobre o que o cliente quer, dá uma nota ao lead e passa
              para um vendedor na hora certa.
            </p>
          </div>
        </div>
        <Toggle checked={s.enabled} onChange={(v) => save({ enabled: v })} label={s.enabled ? "Ligado" : "Desligado"} />
      </div>

      {aiReady === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <b>Falta a chave da IA no motor.</b> No Railway, abra o serviço do motor → <b>Variables</b> → crie{" "}
          <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> com a sua chave (console.anthropic.com).
          Sem ela a IA não responde, mesmo ligada aqui.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Modelo de IA" hint="Sonnet atende bem a maioria dos casos.">
          <Select
            value={isCustomModel ? "__custom" : s.model}
            onChange={(e) => setS({ ...s, model: e.target.value === "__custom" ? "" : e.target.value })}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="__custom">Outro (digitar o nome)</option>
          </Select>
          {isCustomModel && (
            <Input
              className="mt-2"
              placeholder="ex.: claude-sonnet-4-5"
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
            />
          )}
        </Field>
        <Field label="Avisar o vendedor" hint="Manda um resumo do lead no WhatsApp do vendedor quando ele receber um lead.">
          <div className="pt-2">
            <Toggle
              checked={s.notifySeller}
              onChange={(v) => setS({ ...s, notifySeller: v })}
              label={s.notifySeller ? "Sim, avisar no WhatsApp dele" : "Não avisar"}
            />
          </div>
        </Field>
      </div>

      <Field
        label="Como a IA deve atender (instruções)"
        hint="Explique como a loja funciona, o jeito de falar, o que perguntar e quando passar para um vendedor. Preços e condições que a IA pode informar também entram aqui."
      >
        <Textarea rows={14} value={s.systemPrompt} onChange={(e) => setS({ ...s, systemPrompt: e.target.value })} />
      </Field>

      <Field
        label="Mensagem ao transferir para o vendedor"
        hint="Use {vendedor} para o nome do vendedor. Deixe vazio para não enviar nada."
      >
        <Textarea rows={3} value={s.handoffMessage} onChange={(e) => setS({ ...s, handoffMessage: e.target.value })} />
      </Field>

      <ErrorNote message={error} />
      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={saving}>
          {saved ? (
            <>
              <Check size={16} /> Salvo
            </>
          ) : saving ? (
            "Salvando..."
          ) : (
            "Salvar"
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SellersTab() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/sdr/sellers").then((r) => r.json()).then(setSellers), []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await api("/api/sdr/sellers", "POST", { name, phone });
      setName("");
      setPhone("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 p-6">
      <p className="text-sm text-slate-600">
        Vendedores que recebem os leads. O WhatsApp de cada um é usado para avisar quando chega um lead novo.
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Nome do vendedor" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="WhatsApp com DDD (ex.: 35999998888)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button onClick={add}>
          <Plus size={16} /> Adicionar
        </Button>
      </div>
      <ErrorNote message={error} />
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {sellers.length === 0 ? (
          <EmptyState title="Nenhum vendedor cadastrado" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sellers.map((s) =>
                editing === s.id ? (
                  <tr key={s.id}>
                    <td className="px-4 py-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </td>
                    <td className="px-4 py-2">
                      <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                    </td>
                    <td />
                    <td className="px-4 py-2 text-right">
                      <Button
                        onClick={async () => {
                          await api(`/api/sdr/sellers/${s.id}`, "PATCH", { name: editName, phone: editPhone });
                          setEditing(null);
                          load();
                        }}
                      >
                        Salvar
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          await api(`/api/sdr/sellers/${s.id}`, "PATCH", { active: !s.active });
                          load();
                        }}
                      >
                        {s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing(s.id);
                            setEditName(s.name);
                            setEditPhone(s.phone || "");
                          }}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`Excluir ${s.name}? Os leads dele ficam sem vendedor.`)) return;
                            await api(`/api/sdr/sellers/${s.id}`, "DELETE");
                            load();
                          }}
                        >
                          <Trash2 size={15} className="text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [region, setRegion] = useState("");
  const [saleType, setSaleType] = useState("ANY");
  const [sellerId, setSellerId] = useState("");
  const [priority, setPriority] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch("/api/sdr/rules").then((x) => x.json()),
      fetch("/api/sdr/sellers").then((x) => x.json()),
    ]);
    setRules(r);
    setSellers(s);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setError(null);
    if (!sellerId) return setError("Escolha o vendedor");
    try {
      await api("/api/sdr/rules", "POST", { region: region || null, saleType, sellerId, priority });
      setRegion("");
      setPriority(0);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 p-6">
      <p className="text-sm text-slate-600">
        Quando a IA transfere um lead, ela usa estas regras para escolher o vendedor: pela <b>cidade/região</b> e pelo{" "}
        <b>tipo de compra</b>. Maior prioridade ganha. Deixe a região vazia para valer para qualquer lugar.
      </p>
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_110px_auto]">
        <Input placeholder="Cidade ou região (ex.: Varginha)" value={region} onChange={(e) => setRegion(e.target.value)} />
        <Select value={saleType} onChange={(e) => setSaleType(e.target.value)}>
          <option value="ANY">Qualquer tipo</option>
          <option value="RETAIL">Varejo</option>
          <option value="WHOLESALE">Atacado</option>
        </Select>
        <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
          <option value="">Vendedor...</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          title="Prioridade"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
        />
        <Button onClick={add}>
          <Plus size={16} /> Adicionar
        </Button>
      </div>
      <ErrorNote message={error} />
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {rules.length === 0 ? (
          <EmptyState
            title="Nenhuma regra ainda"
            text="Sem regras, o lead transferido fica sem vendedor e aparece como Lead quente para alguém assumir."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Região</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.region || "Qualquer região"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.saleType === "ANY" ? "Qualquer tipo" : SALE_TYPE_LABEL[r.saleType]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.seller?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/api/sdr/rules/${r.id}`, "DELETE");
                        load();
                      }}
                    >
                      <Trash2 size={15} className="text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TagsTab() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");

  const load = useCallback(() => fetch("/api/sdr/tags").then((r) => r.json()).then(setTags), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 p-6">
      <p className="text-sm text-slate-600">
        Etiquetas organizam os leads (ex.: “Pediu orçamento”, “Revendedor”). A IA também aplica estas etiquetas
        sozinha quando fizer sentido.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" placeholder="Nome da etiqueta" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-1.5">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full ${TAG_DOT_CLASSES[c]} ${color === c ? "ring-2 ring-slate-800 ring-offset-2" : ""}`}
              aria-label={c}
            />
          ))}
        </div>
        <Button
          onClick={async () => {
            if (!name.trim()) return;
            await api("/api/sdr/tags", "POST", { name, color });
            setName("");
            load();
          }}
        >
          <Plus size={16} /> Criar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && <p className="text-sm text-slate-400">Nenhuma etiqueta ainda.</p>}
        {tags.map((t) => (
          <span
            key={t.id}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
              TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.gray
            }`}
          >
            {t.name}
            <button
              onClick={async () => {
                await api(`/api/sdr/tags/${t.id}`, "DELETE");
                load();
              }}
              className="opacity-60 hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function QuickRepliesTab() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => fetch("/api/sdr/quick-replies").then((r) => r.json()).then(setItems), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 p-6">
      <p className="text-sm text-slate-600">
        Mensagens prontas. Na conversa, digite <b>/</b> e o atalho para usar (ex.: <b>/pix</b>).
      </p>
      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
        <Input placeholder="Atalho (ex.: pix)" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
        <Input placeholder="Mensagem" value={message} onChange={(e) => setMessage(e.target.value)} />
        <Button
          onClick={async () => {
            if (!shortcut.trim() || !message.trim()) return;
            await api("/api/sdr/quick-replies", "POST", { shortcut, message });
            setShortcut("");
            setMessage("");
            load();
          }}
        >
          <Plus size={16} /> Adicionar
        </Button>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {items.length === 0 && <EmptyState title="Nenhuma resposta rápida" />}
        {items.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-semibold text-[var(--accent)]">/{q.shortcut}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{q.message}</p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                await api(`/api/sdr/quick-replies/${q.id}`, "DELETE");
                load();
              }}
            >
              <Trash2 size={15} className="text-red-500" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function SettingsScreen() {
  const [tab, setTab] = useState<TabKey>("ia");
  return (
    <Page>
      <PageHeader
        title="Configurações"
        description="Atendimento com IA, vendedores, distribuição de leads, etiquetas e respostas rápidas."
      />
      <Card>
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "ia", label: "Atendimento IA" },
            { key: "vendedores", label: "Vendedores" },
            { key: "distribuicao", label: "Distribuição" },
            { key: "etiquetas", label: "Etiquetas" },
            { key: "respostas", label: "Respostas rápidas" },
          ]}
        />
        {tab === "ia" && <AiTab />}
        {tab === "vendedores" && <SellersTab />}
        {tab === "distribuicao" && <RulesTab />}
        {tab === "etiquetas" && <TagsTab />}
        {tab === "respostas" && <QuickRepliesTab />}
      </Card>
    </Page>
  );
}
