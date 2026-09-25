"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Megaphone, Pause, Play, X, Trash2, AlertTriangle, Users, Eye, Paperclip } from "lucide-react";
import { DrivePicker } from "@/components/drive/DrivePicker";
import { DEFAULT_FILTERS, QR_RISK_TEXT, STATUS_LABEL, messageVariations, renderMessage, type BroadcastFilters } from "@/lib/broadcast/common";
import { Page, PageHeader, Card, Button, Field, Input, Textarea, Badge, Modal, EmptyState, ErrorNote } from "@/components/ui";

interface Broadcast {
  id: string;
  name: string;
  message: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  minDelay: number;
  maxDelay: number;
  windowStart: string;
  windowEnd: string;
  dailyLimit: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Options {
  tags: { id: string; name: string }[];
  funnels: { id: string; name: string; columns: { id: string; name: string }[] }[];
  products: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  waState: string | null;
}

const TONE: Record<string, "gray" | "green" | "red" | "blue" | "amber" | "purple"> = {
  SCHEDULED: "blue",
  RUNNING: "green",
  PAUSED: "amber",
  DONE: "gray",
  CANCELED: "red",
  DRAFT: "gray",
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Botões de escolha múltipla (etiquetas, colunas...) */
function Chips({ items, value, onChange, tone = "accent" }: { items: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; tone?: "accent" | "red" }) {
  if (!items.length) return <p className="text-xs text-slate-400">Nada cadastrado.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const on = value.includes(it.id);
        const onCls = tone === "red" ? "border-red-400 bg-red-50 text-red-700" : "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]";
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== it.id) : [...value, it.id])}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${on ? onCls : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
          >
            {on ? "✓ " : ""}
            {it.name}
          </button>
        );
      })}
    </div>
  );
}

interface Form {
  name: string;
  message: string;
  filters: BroadcastFilters;
  citiesText: string;
  minDelay: number;
  maxDelay: number;
  windowStart: string;
  windowEnd: string;
  dailyLimit: number;
  startMode: "now" | "later";
  scheduledAt: string;
  acceptRisk: boolean;
  driveFileId: string | null;
  driveFileName: string;
}

const newForm = (): Form => ({
  name: "",
  message: "",
  filters: { ...DEFAULT_FILTERS },
  citiesText: "",
  minDelay: 40,
  maxDelay: 120,
  windowStart: "08:00",
  windowEnd: "20:00",
  dailyLimit: 200,
  startMode: "now",
  scheduledAt: "",
  acceptRisk: false,
  driveFileId: null,
  driveFileName: "",
});

export function BroadcastsScreen() {
  const [list, setList] = useState<Broadcast[] | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<{ count: number; sample: { name: string | null; city: string | null; phone: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickDrive, setPickDrive] = useState(false);
  const [detail, setDetail] = useState<{ broadcast: Broadcast; recipients: { id: string; name: string | null; phoneJid: string; status: string; error: string | null; sentAt: string | null }[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/broadcasts");
    if (res.ok) setList((await res.json()).broadcasts);
  }, []);
  useEffect(() => {
    load();
    fetch("/api/broadcasts/options")
      .then((r) => r.json())
      .then(setOpts);
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const filters = useMemo<BroadcastFilters | null>(
    () =>
      form
        ? {
            ...form.filters,
            cities: form.citiesText
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
          }
        : null,
    [form]
  );

  // Contagem ao vivo do público
  useEffect(() => {
    if (!filters) return;
    const t = setTimeout(async () => {
      const res = await fetch("/api/broadcasts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      if (res.ok) setPreview(await res.json());
    }, 400);
    return () => clearTimeout(t);
  }, [filters]);

  const open = () => {
    setForm(newForm());
    setStep(1);
    setPreview(null);
    setError(null);
  };

  const setF = (patch: Partial<BroadcastFilters>) => form && setForm({ ...form, filters: { ...form.filters, ...patch } });

  const create = async () => {
    if (!form || !filters) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          filters,
          scheduledAt: form.startMode === "later" && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Falha ao criar");
      setForm(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (b: Broadcast, action: "pause" | "resume" | "cancel") => {
    if (action === "cancel" && !confirm(`Cancelar o disparo "${b.name}"? Quem ainda não recebeu não vai receber.`)) return;
    await fetch(`/api/broadcasts/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    load();
  };
  const remove = async (b: Broadcast) => {
    if (!confirm(`Excluir o disparo "${b.name}" e o histórico dele?`)) return;
    const res = await fetch(`/api/broadcasts/${b.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error || "Não foi possível excluir");
    load();
  };
  const openDetail = async (b: Broadcast) => {
    const res = await fetch(`/api/broadcasts/${b.id}`);
    if (res.ok) setDetail(await res.json());
  };

  const variations = form ? messageVariations(form.message) : [];
  const canNext =
    form &&
    ((step === 1 && (preview?.count || 0) > 0) ||
      (step === 2 && form.name.trim() && variations.length > 0) ||
      step === 3 ||
      (step === 4 && form.acceptRisk));

  return (
    <Page>
      <PageHeader
        title="Disparos"
        description="Envie uma mensagem para vários leads de uma vez, escolhendo quem recebe por etiqueta, coluna do funil, cidade, produto ou vendedor."
        actions={
          <Button onClick={open}>
            <Plus size={16} /> Novo disparo
          </Button>
        }
      />

      <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Cuidado com bloqueio do número</p>
          <p>{QR_RISK_TEXT[0]}</p>
        </div>
      </div>

      {!list ? (
        <p className="text-slate-500">Carregando...</p>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum disparo ainda" text="Crie o primeiro escolhendo o público e a mensagem." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((b) => {
            const done = b.sent + b.failed;
            const pct = b.total ? Math.round((done / b.total) * 100) : 0;
            return (
              <Card key={b.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      <Megaphone size={16} className="text-[var(--accent)]" /> {b.name}
                      <Badge tone={TONE[b.status] || "gray"}>{STATUS_LABEL[b.status] || b.status}</Badge>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{messageVariations(b.message)[0]}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Criado por {b.createdBy || "—"} em {fmt(b.createdAt)} · início {fmt(b.scheduledAt)} · intervalo {b.minDelay}–{b.maxDelay}s ·{" "}
                      {b.windowStart}–{b.windowEnd} · até {b.dailyLimit}/dia
                    </p>
                    {b.lastError && b.status !== "DONE" && <p className="mt-1 text-xs text-red-600">{b.lastError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openDetail(b)}>
                      <Eye size={15} /> Ver
                    </Button>
                    {["SCHEDULED", "RUNNING"].includes(b.status) && (
                      <Button variant="secondary" onClick={() => act(b, "pause")}>
                        <Pause size={15} /> Pausar
                      </Button>
                    )}
                    {b.status === "PAUSED" && (
                      <Button variant="secondary" onClick={() => act(b, "resume")}>
                        <Play size={15} /> Continuar
                      </Button>
                    )}
                    {!["DONE", "CANCELED"].includes(b.status) && (
                      <Button variant="danger" onClick={() => act(b, "cancel")}>
                        <X size={15} /> Cancelar
                      </Button>
                    )}
                    {b.status !== "RUNNING" && (
                      <Button variant="ghost" onClick={() => remove(b)} title="Excluir">
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>
                      {b.sent} enviados{b.failed ? ` · ${b.failed} com erro` : ""} de {b.total}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title={`Novo disparo — ${["Público", "Mensagem", "Envio", "Riscos"][step - 1]} (${step}/4)`}
        open={form !== null}
        onClose={() => setForm(null)}
        wide
        footer={
          <>
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                Voltar
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Continuar
              </Button>
            ) : (
              <Button onClick={create} disabled={!canNext || saving}>
                {saving ? "Criando..." : form?.startMode === "later" ? "Agendar disparo" : "Iniciar disparo"}
              </Button>
            )}
          </>
        }
      >
        {form && opts && (
          <div className="space-y-5">
            <ErrorNote message={error} />
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Users size={16} /> Público: <b>{preview ? `${preview.count} lead${preview.count === 1 ? "" : "s"}` : "calculando..."}</b>
            </div>

            {step === 1 && (
              <>
                <Field label="Com estas etiquetas (qualquer uma)">
                  <Chips items={opts.tags} value={form.filters.tagIds} onChange={(v) => setF({ tagIds: v })} />
                </Field>
                <Field label="Sem estas etiquetas">
                  <Chips items={opts.tags} value={form.filters.excludeTagIds} onChange={(v) => setF({ excludeTagIds: v })} tone="red" />
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-slate-800">Colunas do funil</p>
                  <div className="space-y-2">
                    {opts.funnels.map((f) => (
                      <div key={f.id}>
                        {opts.funnels.length > 1 && <p className="mb-1 text-xs font-semibold text-slate-500">{f.name}</p>}
                        <Chips items={f.columns} value={form.filters.columnIds} onChange={(v) => setF({ columnIds: v })} />
                      </div>
                    ))}
                  </div>
                </div>
                <Field label="Produto de interesse">
                  <Chips items={opts.products} value={form.filters.productIds} onChange={(v) => setF({ productIds: v })} />
                </Field>
                <Field label="Vendedor">
                  <Chips items={[...opts.sellers, { id: "none", name: "Sem vendedor" }]} value={form.filters.sellerIds} onChange={(v) => setF({ sellerIds: v })} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Cidades" hint="Separe por vírgula. Vazio = todas.">
                    <Input value={form.citiesText} onChange={(e) => setForm({ ...form, citiesText: e.target.value })} placeholder="Ex.: Matão, Araraquara" />
                  </Field>
                  <Field label="Conversou nos últimos (dias)" hint="0 = qualquer data.">
                    <Input
                      type="number"
                      min={0}
                      value={String(form.filters.activeDays)}
                      onChange={(e) => setF({ activeDays: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </Field>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-[var(--accent)]" checked={form.filters.onlyReplied} onChange={(e) => setF({ onlyReplied: e.target.checked })} />
                    Só quem já mandou mensagem para a empresa (recomendado, menos risco de bloqueio)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-[var(--accent)]" checked={form.filters.includeClosed} onChange={(e) => setF({ includeClosed: e.target.checked })} />
                    Incluir quem já comprou (vendas fechadas)
                  </label>
                </div>
                {preview && preview.sample.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Exemplos: {preview.sample.map((s) => s.name || s.phone).join(", ")}
                    {preview.count > preview.sample.length ? "..." : ""}
                  </p>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Nome do disparo (só para você)">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Promoção Jet — setembro" />
                </Field>
                <Field
                  label="Mensagem"
                  hint='Use {nome} e {cidade}. Para variar o texto (menos risco de bloqueio), escreva outras versões separadas por uma linha só com ---'
                >
                  <Textarea
                    rows={9}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder={"Oi, {nome}! Tudo bem?\n...\n---\nOlá, {nome}! Passando para contar...\n---\n{nome}, boa tarde! ..."}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Button variant="secondary" onClick={() => setPickDrive(true)}>
                    <Paperclip size={15} /> {form.driveFileId ? "Trocar arquivo" : "Anexar arquivo do Drive"}
                  </Button>
                  {form.driveFileId && (
                    <span className="flex items-center gap-2 text-slate-600">
                      {form.driveFileName}
                      <button onClick={() => setForm({ ...form, driveFileId: null, driveFileName: "" })} className="text-red-500 hover:underline">
                        remover
                      </button>
                    </span>
                  )}
                </div>
                <DrivePicker open={pickDrive} onClose={() => setPickDrive(false)} onPick={(f) => setForm({ ...form, driveFileId: f.id, driveFileName: f.name })} />
                {variations.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-slate-500">
                      {variations.length} variação(ões) · exemplo para &quot;Maria, de Matão&quot;:
                    </p>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#dcf8c6] px-4 py-3 text-sm text-slate-800">
                      {renderMessage(form.message, { name: "Maria Souza", city: "Matão" }, 0)}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Intervalo entre mensagens (segundos)" hint="O sistema sorteia um tempo entre os dois. Recomendado: 40 a 120.">
                    <div className="flex items-center gap-2">
                      <Input type="number" min={15} value={String(form.minDelay)} onChange={(e) => setForm({ ...form, minDelay: Number(e.target.value) || 15 })} />
                      <span className="text-slate-400">a</span>
                      <Input type="number" min={15} value={String(form.maxDelay)} onChange={(e) => setForm({ ...form, maxDelay: Number(e.target.value) || 15 })} />
                    </div>
                  </Field>
                  <Field label="Máximo por dia" hint="Somando todos os disparos da conta.">
                    <Input type="number" min={1} value={String(form.dailyLimit)} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) || 1 })} />
                  </Field>
                  <Field label="Só enviar entre" hint="Horário de Brasília. Fora dele o disparo espera.">
                    <div className="flex items-center gap-2">
                      <Input type="time" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} />
                      <span className="text-slate-400">e</span>
                      <Input type="time" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} />
                    </div>
                  </Field>
                  <Field label="Começar">
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={form.startMode === "now"} onChange={() => setForm({ ...form, startMode: "now" })} /> Agora
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={form.startMode === "later"} onChange={() => setForm({ ...form, startMode: "later" })} /> Agendar
                      </label>
                      {form.startMode === "later" && (
                        <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="max-w-[230px]" />
                      )}
                    </div>
                  </Field>
                </div>
                {preview && (
                  <p className="text-sm text-slate-600">
                    Tempo estimado: cerca de{" "}
                    <b>
                      {Math.max(1, Math.round((preview.count * ((form.minDelay + form.maxDelay) / 2)) / 60))} minutos
                    </b>{" "}
                    de envio{preview.count > form.dailyLimit ? `, divididos em ${Math.ceil(preview.count / form.dailyLimit)} dias pelo limite diário` : ""}.
                  </p>
                )}
              </>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="mb-2 flex items-center gap-2 font-semibold">
                    <AlertTriangle size={18} /> Risco de bloqueio ou banimento do número
                  </p>
                  <div className="space-y-2">
                    {QR_RISK_TEXT.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={form.acceptRisk} onChange={(e) => setForm({ ...form, acceptRisk: e.target.checked })} />
                  Li e entendo que o disparo pode causar o bloqueio ou banimento do número de WhatsApp, e assumo esse risco.
                </label>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal title={detail ? detail.broadcast.name : ""} open={detail !== null} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{detail.broadcast.message}</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Lead</th>
                  <th>Situação</th>
                  <th>Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.recipients.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">
                      {r.name || "—"} <span className="text-xs text-slate-400">{r.phoneJid.split("@")[0]}</span>
                    </td>
                    <td>
                      <Badge tone={r.status === "SENT" ? "green" : r.status === "FAILED" ? "red" : r.status === "SKIPPED" ? "gray" : "blue"}>
                        {{ SENT: "Enviado", FAILED: "Erro", SKIPPED: "Não enviado", PENDING: "Na fila" }[r.status] || r.status}
                      </Badge>
                      {r.error && <span className="ml-2 text-xs text-red-500">{r.error}</span>}
                    </td>
                    <td className="text-slate-500">{fmt(r.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Page>
  );
}
