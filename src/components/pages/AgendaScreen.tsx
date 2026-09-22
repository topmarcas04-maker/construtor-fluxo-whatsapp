"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Bot, Bell, BellOff, CheckCircle2, Clock, CalendarDays, List } from "lucide-react";
import { Card, Button, Badge } from "@/components/ui";
import { ExpandButton } from "@/components/layout/Fullscreen";
import { AppointmentModal } from "@/components/agenda/AppointmentModal";
import { type Appointment, STATUS_LABEL, STATUS_STYLE, appointmentLeadName, spParts, todaySp } from "@/components/agenda/types";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
/** Dias exibidos no calendário do mês (semanas completas) */
function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const days: { date: string; inMonth: boolean; day: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push({ date: ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: d.getUTCMonth() === month, day: d.getUTCDate() });
  }
  // remove a última semana se ela for toda do mês seguinte
  return days.slice(35).every((d) => !d.inMonth) ? days.slice(0, 35) : days;
}
function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][wd]}, ${d} de ${MONTHS[m - 1].toLowerCase()}`;
}

function ReminderIcon({ a }: { a: Appointment }) {
  if (!a.reminderEnabled) return <BellOff size={13} className="text-slate-300" />;
  if (a.reminderSentAt) return <CheckCircle2 size={13} className="text-emerald-500" />;
  if (a.reminderError) return <Bell size={13} className="text-red-500" />;
  return <Bell size={13} className="text-slate-400" />;
}

export function AgendaScreen() {
  const today = todaySp();
  const [ty, tm] = today.split("-").map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<"mes" | "lista">("mes");
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ appointment: Appointment | null; defaults?: { date: string } } | null>(null);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  const load = useCallback(async () => {
    const from = new Date(`${grid[0].date}T00:00:00-03:00`);
    const to = new Date(`${grid[grid.length - 1].date}T23:59:59-03:00`);
    // Lista: também os próximos 30 dias a partir de hoje
    const listTo = new Date(Math.max(to.getTime(), Date.now() + 30 * 864e5));
    const res = await fetch(`/api/appointments?from=${from.toISOString()}&to=${listTo.toISOString()}`, { cache: "no-store" });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [grid]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of items) {
      const d = spParts(a.startsAt).date;
      map.set(d, [...(map.get(d) || []), a]);
    }
    return map;
  }, [items]);

  const upcoming = useMemo(
    () => items.filter((a) => a.status === "SCHEDULED" && new Date(a.startsAt).getTime() >= Date.now() - 3600e3).slice(0, 40),
    [items]
  );

  const stats = useMemo(() => {
    const inMonth = items.filter((a) => spParts(a.startsAt).date.startsWith(`${year}-${pad(month + 1)}`));
    return {
      today: (byDay.get(today) || []).filter((a) => a.status !== "CANCELED").length,
      month: inMonth.filter((a) => a.status !== "CANCELED").length,
      done: inMonth.filter((a) => a.status === "DONE").length,
      ai: inMonth.filter((a) => a.createdBy === "AI").length,
    };
  }, [items, byDay, today, year, month]);

  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };

  const quickStatus = async (a: Appointment, status: string) => {
    await fetch(`/api/appointments/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const dayItems = (byDay.get(selected) || []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const AppointmentRow = ({ a, showDate }: { a: Appointment; showDate?: boolean }) => {
    const p = spParts(a.startsAt);
    return (
      <div className="group flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:shadow-sm">
        <div className="w-14 shrink-0 text-center">
          {showDate && <p className="text-[11px] font-semibold uppercase text-slate-400">{p.date.split("-").reverse().slice(0, 2).join("/")}</p>}
          <p className="text-lg font-semibold text-slate-900">{p.time}</p>
          <p className="text-[11px] text-slate-400">{a.durationMinutes} min</p>
        </div>
        <button className="min-w-0 flex-1 text-left" onClick={() => setModal({ appointment: a })}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{a.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
            {a.createdBy === "AI" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                <Bot size={11} /> IA
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-600">
            {appointmentLeadName(a)}
            {a.seller ? ` · ${a.seller.name}` : ""}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
            <ReminderIcon a={a} />
            {!a.reminderEnabled
              ? "Sem mensagem automática"
              : a.reminderSentAt
              ? "Mensagem enviada"
              : a.reminderError
              ? `Mensagem pendente: ${a.reminderError}`
              : "Mensagem automática programada"}
          </p>
        </button>
        {a.status === "SCHEDULED" && (
          <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
            <button onClick={() => quickStatus(a, "DONE")} className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50">
              Realizado
            </button>
            <button onClick={() => quickStatus(a, "NO_SHOW")} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50">
              Faltou
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="mr-2 text-xl font-semibold text-slate-900">Agenda</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => moveMonth(-1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <p className="w-40 text-center font-semibold text-slate-800">
            {MONTHS[month]} {year}
          </p>
          <button onClick={() => moveMonth(1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Próximo mês">
            <ChevronRight size={18} />
          </button>
          <Button
            variant="secondary"
            className="ml-1 px-3 py-1.5"
            onClick={() => {
              setYear(ty);
              setMonth(tm - 1);
              setSelected(today);
            }}
          >
            Hoje
          </Button>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          {(
            [
              { key: "mes", label: "Mês", icon: CalendarDays },
              { key: "lista", label: "Próximos", icon: List },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-4 text-sm text-slate-500 lg:flex">
          <span>
            <b className="text-slate-800">{stats.today}</b> hoje
          </span>
          <span>
            <b className="text-slate-800">{stats.month}</b> no mês
          </span>
          <span>
            <b className="text-emerald-600">{stats.done}</b> realizados
          </span>
          <span>
            <b className="text-violet-600">{stats.ai}</b> pela IA
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setModal({ appointment: null, defaults: { date: selected } })}>
            <Plus size={16} /> Novo agendamento
          </Button>
          <ExpandButton />
        </div>
      </div>

      {view === "mes" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-h-0 flex-col p-5">
            <div className="grid grid-cols-7 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className={`grid min-h-0 flex-1 grid-cols-7 gap-1.5 ${grid.length > 35 ? "grid-rows-6" : "grid-rows-5"}`}>
              {grid.map((d) => {
                const list = (byDay.get(d.date) || []).filter((a) => a.status !== "CANCELED");
                const isToday = d.date === today;
                const isSel = d.date === selected;
                return (
                  <button
                    key={d.date}
                    onClick={() => setSelected(d.date)}
                    onDoubleClick={() => setModal({ appointment: null, defaults: { date: d.date } })}
                    className={`flex min-h-[92px] flex-col overflow-hidden rounded-xl border p-1.5 text-left transition ${
                      isSel ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-slate-200 hover:border-slate-300"
                    } ${d.inMonth ? "bg-white" : "bg-slate-50/70"}`}
                  >
                    <span
                      className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? "bg-[var(--accent)] text-white" : d.inMonth ? "text-slate-700" : "text-slate-300"
                      }`}
                    >
                      {d.day}
                    </span>
                    <div className="space-y-0.5">
                      {list.slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          className={`block truncate rounded-md border px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[a.status]}`}
                          title={`${spParts(a.startsAt).time} ${a.title} — ${appointmentLeadName(a)}`}
                        >
                          <b>{spParts(a.startsAt).time}</b> {appointmentLeadName(a)}
                        </span>
                      ))}
                      {list.length > 3 && <span className="block px-1 text-[11px] font-medium text-slate-500">+{list.length - 3} mais</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{longDate(selected)}</p>
                <p className="text-sm text-slate-500">
                  {dayItems.length === 0 ? "Nada marcado" : `${dayItems.length} agendamento${dayItems.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <Button variant="secondary" className="px-3" onClick={() => setModal({ appointment: null, defaults: { date: selected } })}>
                <Plus size={15} />
              </Button>
            </div>
            <div className="space-y-2.5">
              {loading ? (
                <p className="text-sm text-slate-400">Carregando...</p>
              ) : dayItems.length === 0 ? (
                <Card className="p-6 text-center">
                  <Clock className="mx-auto mb-2 text-slate-300" size={28} />
                  <p className="text-sm text-slate-500">Dê dois cliques num dia do calendário para marcar rapidamente.</p>
                </Card>
              ) : (
                dayItems.map((a) => <AppointmentRow key={a.id} a={a} />)
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-2.5">
            {upcoming.length === 0 ? (
              <Card className="p-10 text-center">
                <CalendarDays className="mx-auto mb-2 text-slate-300" size={32} />
                <p className="font-semibold text-slate-700">Nenhum compromisso pela frente</p>
                <p className="mt-1 text-sm text-slate-500">
                  Os horários que você ou a IA marcarem aparecem aqui. <Badge tone="purple">IA</Badge> = marcado pela IA.
                </p>
              </Card>
            ) : (
              upcoming.map((a) => <AppointmentRow key={a.id} a={a} showDate />)
            )}
          </div>
        </div>
      )}

      <AppointmentModal
        open={modal !== null}
        appointment={modal?.appointment || null}
        defaults={modal?.defaults}
        onClose={() => setModal(null)}
        onSaved={load}
      />
    </div>
  );
}
