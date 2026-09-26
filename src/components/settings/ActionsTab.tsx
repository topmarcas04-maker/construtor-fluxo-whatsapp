"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Phone, Bookmark, UserRound, Info, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { Button, Field, Input, Select, Textarea, Toggle, Badge, Modal, ErrorNote } from "@/components/ui";
import { ACTION_KIND_LABEL, ACTION_KIND_HINT, ACTION_KINDS, type AiAction } from "@/lib/actions/common";
import type { FunnelColumn } from "@/lib/funnel/common";

const KIND_ICON: Record<string, typeof CalendarDays> = {
  SCHEDULE: CalendarDays,
  CALL: Phone,
  RESERVE: Bookmark,
  HANDOFF: UserRound,
  INFO: Info,
};

const KIND_TONE: Record<string, string> = {
  SCHEDULE: "bg-sky-50 text-sky-700",
  CALL: "bg-blue-50 text-blue-700",
  RESERVE: "bg-amber-50 text-amber-700",
  HANDOFF: "bg-emerald-50 text-emerald-700",
  INFO: "bg-violet-50 text-violet-700",
};

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

type Form = {
  name: string;
  kind: string;
  instructions: string;
  appointmentTitle: string;
  appointmentMinutes: string;
  columnId: string;
  handoff: boolean;
  active: boolean;
};

export function ActionsTab() {
  const [actions, setActions] = useState<AiAction[] | null>(null);
  const [columns, setColumns] = useState<(FunnelColumn & { funnelName?: string })[]>([]);
  const [editing, setEditing] = useState<AiAction | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([api("/api/sdr/actions", "GET"), api("/api/sdr/columns?all=1", "GET").catch(() => [])]);
    setActions(a);
    setColumns(c);
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const open = (a: AiAction | "new") => {
    setError(null);
    setEditing(a);
    setForm(
      a === "new"
        ? { name: "", kind: "SCHEDULE", instructions: "", appointmentTitle: "", appointmentMinutes: "30", columnId: "", handoff: false, active: true }
        : {
            name: a.name,
            kind: a.kind,
            instructions: a.instructions || "",
            appointmentTitle: a.appointmentTitle || "",
            appointmentMinutes: a.appointmentMinutes ? String(a.appointmentMinutes) : "",
            columnId: a.columnId || "",
            handoff: a.handoff,
            active: a.active,
          }
    );
  };

  const save = async () => {
    if (!form || !editing) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        appointmentTitle: form.kind === "SCHEDULE" ? form.appointmentTitle : null,
        appointmentMinutes: form.kind === "SCHEDULE" ? form.appointmentMinutes : null,
        columnId: form.columnId || null,
        handoff: form.kind === "HANDOFF" ? true : form.handoff,
      };
      setActions(editing === "new" ? await api("/api/sdr/actions", "POST", body) : await api(`/api/sdr/actions/${editing.id}`, "PATCH", body));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: AiAction) => {
    if (!confirm(`Apagar a ação "${a.name}"? Ela sai de todos os produtos e categorias.`)) return;
    try {
      setActions(await api(`/api/sdr/actions/${a.id}`, "DELETE"));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = async (a: AiAction) => {
    setActions(await api(`/api/sdr/actions/${a.id}`, "PATCH", { active: !a.active }));
  };

  if (!actions) return <p className="p-6 text-sm text-slate-400">Carregando...</p>;
  const manyFunnels = new Set(columns.map((c) => c.funnelId)).size > 1;
  const colLabel = (c: FunnelColumn & { funnelName?: string }) => (manyFunnels && c.funnelName ? `${c.funnelName} → ${c.name}` : c.name);
  const colName = (id: string | null) => {
    const c = columns.find((x) => x.id === id);
    return c ? colLabel(c) : undefined;
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="font-semibold text-slate-900">Ações do Agente</p>
          <p className="text-sm text-slate-600">
            São os procedimentos que a IA conduz com o cliente: agendar reunião ou test-drive, reservar, explicar o financiamento,
            pedir ligação, passar para vendedor. Depois, em <b>Produtos</b>, escolha quais ações valem para cada produto ou categoria.
          </p>
        </div>
        <Button onClick={() => open("new")}>
          <Plus size={16} /> Nova ação
        </Button>
      </div>
      <ErrorNote message={error && !editing ? error : null} />

      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((a) => {
          const Icon = KIND_ICON[a.kind] || Info;
          return (
            <div key={a.id} className={`rounded-xl border border-slate-200 bg-white p-4 ${a.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${KIND_TONE[a.kind] || KIND_TONE.INFO}`}>
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">{ACTION_KIND_LABEL[a.kind]}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Toggle checked={a.active} onChange={() => toggle(a)} />
                  <button onClick={() => open(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar">
                    <Pencil size={15} />
                  </button>
                </div>
              </div>
              {a.instructions && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{a.instructions}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.kind === "SCHEDULE" && (
                  <Badge tone="blue">
                    Agenda: {a.appointmentTitle || a.name}
                    {a.appointmentMinutes ? ` · ${a.appointmentMinutes} min` : ""}
                  </Badge>
                )}
                {colName(a.columnId) && (
                  <Badge>
                    <ArrowRight size={11} className="mr-1" /> Coluna {colName(a.columnId)}
                  </Badge>
                )}
                {(a.handoff || a.kind === "HANDOFF") && <Badge tone="green">Passa para vendedor</Badge>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={editing === "new" ? "Nova ação" : "Editar ação"}
        open={editing !== null && form !== null}
        onClose={() => setEditing(null)}
        footer={
          <>
            {editing && editing !== "new" && (
              <Button variant="danger" className="mr-auto" onClick={() => remove(editing)}>
                <Trash2 size={15} /> Apagar
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !form?.name.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="Nome da ação">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Agendar demonstração" autoFocus />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">O que a IA faz</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTION_KINDS.map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <button
                      key={k}
                      onClick={() => setForm({ ...form, kind: k })}
                      className={`flex items-start gap-2 rounded-xl border p-3 text-left ${
                        form.kind === k ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0 text-slate-500" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">{ACTION_KIND_LABEL[k]}</span>
                        <span className="block text-xs text-slate-500">{ACTION_KIND_HINT[k]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Instruções para a IA" hint="O que explicar, o que perguntar, o que nunca dizer.">
              <Textarea rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </Field>
            {form.kind === "SCHEDULE" && (
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label="Nome na agenda" hint="O produto entra junto: “Test-drive – Scooter X1”">
                  <Input value={form.appointmentTitle} onChange={(e) => setForm({ ...form, appointmentTitle: e.target.value })} placeholder={form.name || "Reunião"} />
                </Field>
                <Field label="Duração (min)">
                  <Input inputMode="numeric" value={form.appointmentMinutes} onChange={(e) => setForm({ ...form, appointmentMinutes: e.target.value.replace(/\D/g, "") })} placeholder="30" />
                </Field>
              </div>
            )}
            <Field label="Ao concluir, mover o card para" hint="Opcional">
              <Select value={form.columnId} onChange={(e) => setForm({ ...form, columnId: e.target.value })}>
                <option value="">Não mover</option>
                {columns
                  .filter((c) => c.kind !== "SALE")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {colLabel(c)}
                    </option>
                  ))}
              </Select>
            </Field>
            {form.kind !== "HANDOFF" && (
              <Toggle
                checked={form.handoff}
                onChange={(v) => setForm({ ...form, handoff: v })}
                label={form.handoff ? "Ao concluir, passa para um vendedor" : "Ao concluir, a IA continua atendendo"}
              />
            )}
            <ErrorNote message={error} />
          </div>
        )}
      </Modal>
    </div>
  );
}
