"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Bot, Search } from "lucide-react";
import { Modal, Button, Field, Input, Select, Textarea, Toggle, ErrorNote } from "@/components/ui";
import type { Lead, Seller } from "@/lib/types/sdr";
import { leadDisplayName } from "@/lib/types/sdr";
import { type Appointment, REMINDER_OPTIONS, STATUS_LABEL, spParts, todaySp } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  appointment?: Appointment | null;
  /** Valores iniciais para um novo agendamento */
  defaults?: { date?: string; time?: string; leadId?: string | null };
}

interface FormState {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  leadId: string;
  sellerId: string;
  notes: string;
  status: string;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  reminderMessage: string;
}

export function AppointmentModal({ open, onClose, onSaved, appointment, defaults }: Props) {
  const [form, setForm] = useState<FormState | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsTemplate, setSettingsTemplate] = useState<{ msg: string; min: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLeadSearch("");
    Promise.all([
      fetch("/api/sdr/leads").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sdr/sellers").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sdr/settings").then((r) => (r.ok ? r.json() : null)),
    ]).then(([l, s, st]) => {
      setLeads(l);
      setSellers(s);
      if (st) setSettingsTemplate({ msg: st.reminderMessage || "", min: st.reminderMinutesBefore || 0 });
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      const p = spParts(appointment.startsAt);
      setForm({
        title: appointment.title,
        date: p.date,
        time: p.time,
        durationMinutes: appointment.durationMinutes,
        leadId: appointment.leadId || "",
        sellerId: appointment.sellerId || "",
        notes: appointment.notes || "",
        status: appointment.status,
        reminderEnabled: appointment.reminderEnabled,
        reminderMinutesBefore: appointment.reminderMinutesBefore,
        reminderMessage: appointment.reminderMessage || "",
      });
    } else {
      setForm({
        title: "Visita à loja",
        date: defaults?.date || todaySp(),
        time: defaults?.time || "10:00",
        durationMinutes: 30,
        leadId: defaults?.leadId || "",
        sellerId: "",
        notes: "",
        status: "SCHEDULED",
        reminderEnabled: true,
        reminderMinutesBefore: settingsTemplate?.min ?? 0,
        reminderMessage: settingsTemplate?.msg ?? "",
      });
    }
  }, [open, appointment, defaults, settingsTemplate]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const list = q
      ? leads.filter((l) => [leadDisplayName(l), l.phone, l.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      : leads;
    return list.slice(0, 50);
  }, [leads, leadSearch]);

  if (!form) return null;
  const selectedLead = leads.find((l) => l.id === form.leadId);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(appointment ? `/api/appointments/${appointment.id}` : "/api/appointments", {
        method: appointment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, leadId: form.leadId || null, sellerId: form.sellerId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!appointment || !confirm("Excluir este agendamento?")) return;
    await fetch(`/api/appointments/${appointment.id}`, { method: "DELETE" });
    onSaved();
    onClose();
  };

  const up = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  return (
    <Modal
      wide
      open={open}
      onClose={onClose}
      title={appointment ? "Editar agendamento" : "Novo agendamento"}
      footer={
        <>
          {appointment && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {appointment?.createdBy === "AI" && (
          <p className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700">
            <Bot size={15} /> Marcado pela IA durante o atendimento.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <Field label="Assunto *">
            <Input value={form.title} onChange={(e) => up({ title: e.target.value })} placeholder="Ex.: Test-drive, Visita, Ligação" />
          </Field>
          <Field label="Data *">
            <Input type="date" value={form.date} onChange={(e) => up({ date: e.target.value })} />
          </Field>
          <Field label="Hora *">
            <Input type="time" value={form.time} onChange={(e) => up({ time: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cliente (lead)" hint="O lembrete vai para o WhatsApp deste cliente.">
            <div className="rounded-lg border border-slate-300">
              <div className="relative border-b border-slate-200">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder={selectedLead ? leadDisplayName(selectedLead) : "Buscar cliente..."}
                  className="w-full rounded-t-lg py-2 pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <select
                size={4}
                value={form.leadId}
                onChange={(e) => up({ leadId: e.target.value })}
                className="w-full rounded-b-lg px-1 py-1 text-sm outline-none"
              >
                <option value="">— Sem cliente —</option>
                {selectedLead && !filteredLeads.includes(selectedLead) && (
                  <option value={selectedLead.id}>{leadDisplayName(selectedLead)}</option>
                )}
                {filteredLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {leadDisplayName(l)}
                    {l.city ? ` · ${l.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <div className="space-y-4">
            <Field label="Vendedor responsável">
              <Select value={form.sellerId} onChange={(e) => up({ sellerId: e.target.value })}>
                <option value="">Sem vendedor</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração">
                <Select value={form.durationMinutes} onChange={(e) => up({ durationMinutes: Number(e.target.value) })}>
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60}h`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situação">
                <Select value={form.status} onChange={(e) => up({ status: e.target.value })}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <Field label="Observações">
          <Textarea rows={2} value={form.notes} onChange={(e) => up({ notes: e.target.value })} />
        </Field>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold text-slate-800">
              <Bell size={16} /> Mensagem automática no WhatsApp
            </p>
            <Toggle checked={form.reminderEnabled} onChange={(v) => up({ reminderEnabled: v })} label={form.reminderEnabled ? "Ligada" : "Desligada"} />
          </div>
          {form.reminderEnabled && (
            <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
              <Field label="Quando enviar">
                <Select value={form.reminderMinutesBefore} onChange={(e) => up({ reminderMinutesBefore: Number(e.target.value) })}>
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mensagem" hint="Use {nome}, {data}, {hora}, {assunto} e {vendedor}.">
                <Textarea rows={3} value={form.reminderMessage} onChange={(e) => up({ reminderMessage: e.target.value })} />
              </Field>
            </div>
          )}
          {appointment?.reminderSentAt && (
            <p className="mt-2 text-xs text-emerald-700">
              Enviada em {new Date(appointment.reminderSentAt).toLocaleString("pt-BR")}. Se mudar o horário, ela é enviada de novo.
            </p>
          )}
          {appointment?.reminderError && !appointment.reminderSentAt && (
            <p className="mt-2 text-xs text-red-600">Não enviada ainda: {appointment.reminderError}</p>
          )}
          {!form.leadId && form.reminderEnabled && (
            <p className="mt-2 text-xs text-amber-700">Escolha um cliente para a mensagem ser enviada.</p>
          )}
        </section>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
