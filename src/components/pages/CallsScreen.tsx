"use client";

import { useCallback, useEffect, useState } from "react";
import { Video, CalendarCheck, X, Check, UserX, Link2, Settings2 } from "lucide-react";
import { Page, PageHeader, Card, Button, Field, Input, Textarea, Badge, Modal, EmptyState, ErrorNote, Tabs } from "@/components/ui";
import { ShiftEditor } from "@/components/settings/SellerHours";
import { CALL_MIN_LEAD_HOURS, CALL_STATUS_LABEL } from "@/lib/calls/common";
import type { SellerHours } from "@/lib/ai/hours";

interface Call {
  id: string;
  startsAt: string;
  endsAt: string;
  topic: string | null;
  meetingLink: string | null;
  status: string;
  userName: string | null;
  phone: string | null;
  notes: string | null;
  clientName?: string;
}

interface CallSettings {
  callHours: SellerHours;
  callMinutes: number;
  callLink: string;
}

interface Data {
  booking: { provider: string; limit: number; used: number; minutes: number; slots: { date: string; slots: string[] }[]; calls: Call[]; phone: string } | null;
  providing: { settings: { callHours: SellerHours; callMinutes: number; callLink: string }; calls: Call[] } | null;
}

const TONE: Record<string, "blue" | "green" | "red" | "gray"> = { SCHEDULED: "blue", DONE: "green", CANCELED: "gray", NO_SHOW: "red" };
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });

export function CallsScreen() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<"marcar" | "atender">("marcar");
  const [pick, setPick] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<CallSettings | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/calls");
    if (res.ok) {
      const data: Data = await res.json();
      setD(data);
      setPhone((p) => p || data.booking?.phone || "");
      if (!data.booking && data.providing) setTab("atender");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const book = async () => {
    if (!pick) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: pick, topic, phone }) });
    setSaving(false);
    if (!res.ok) return setError((await res.json()).error || "Não foi possível marcar");
    setPick(null);
    setTopic("");
    load();
  };
  const act = async (c: Call, action: string, extra: Record<string, unknown> = {}) => {
    if (action === "cancel" && !confirm(`Cancelar a call de ${when(c.startsAt)}?`)) return;
    const res = await fetch(`/api/calls/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    if (!res.ok) alert((await res.json()).error || "Não foi possível");
    load();
  };
  const setLink = async (c: Call) => {
    const link = prompt("Link da reunião desta call", c.meetingLink || "");
    if (link === null) return;
    act(c, "", { meetingLink: link });
  };
  const saveCfg = async () => {
    if (!cfg) return;
    const res = await fetch("/api/calls/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    if (!res.ok) return alert((await res.json()).error || "Falha ao salvar");
    setCfgOpen(false);
    load();
  };

  if (!d) return <Page><PageHeader title="Calls de acompanhamento" /><p className="text-slate-500">Carregando...</p></Page>;
  const b = d.booking;
  const left = b ? Math.max(0, b.limit - b.used) : 0;

  return (
    <Page>
      <PageHeader title="Calls de acompanhamento" description="Reuniões por vídeo para tirar dúvidas, revisar a configuração e melhorar os resultados." />
      {b && d.providing && (
        <Card className="mb-5">
          <Tabs
            tabs={[
              { key: "marcar", label: "Marcar minha call" },
              { key: "atender", label: "Calls dos meus clientes" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </Card>
      )}

      {tab === "marcar" && b && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <CalendarCheck size={18} /> Escolha um horário com {b.provider}
              </p>
              <Badge tone={left ? "green" : "gray"}>
                {b.limit ? `${left} de ${b.limit} disponíveis este mês` : "Seu plano não inclui calls"}
              </Badge>
            </div>
            {!b.limit ? (
              <EmptyState title="Seu plano não inclui calls de acompanhamento" text="Fale com o suporte para mudar de plano." />
            ) : !left ? (
              <EmptyState title="Você já usou as calls deste mês" text="No próximo mês elas renovam." />
            ) : b.slots.length === 0 ? (
              <EmptyState title="Nenhum horário livre nos próximos dias" text="Tente de novo mais tarde." />
            ) : (
              <div className="space-y-4">
                {b.slots.map((day) => (
                  <div key={day.date}>
                    <p className="mb-2 text-sm font-semibold capitalize text-slate-700">{dayLabel(day.date)}</p>
                    <div className="flex flex-wrap gap-2">
                      {day.slots.map((s) => (
                        <button
                          key={s}
                          onClick={() => setPick(s)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {hour(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-400">Cada call dura {b.minutes} minutos. Dá para cancelar até {CALL_MIN_LEAD_HOURS}h antes.</p>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <p className="mb-3 font-semibold text-slate-900">Minhas calls</p>
            {b.calls.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma call ainda.</p>
            ) : (
              <div className="space-y-3">
                {b.calls.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold capitalize text-slate-800">{when(c.startsAt)}</span>
                      <Badge tone={TONE[c.status]}>{CALL_STATUS_LABEL[c.status]}</Badge>
                    </div>
                    {c.topic && <p className="mt-1 text-slate-600">{c.topic}</p>}
                    {c.status === "SCHEDULED" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.meetingLink && (
                          <a href={c.meetingLink} target="_blank" rel="noreferrer">
                            <Button>
                              <Video size={15} /> Entrar na call
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" onClick={() => act(c, "cancel")}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "atender" && d.providing && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">Calls marcadas com você</p>
            <Button variant="secondary" onClick={() => { setCfg(d.providing!.settings); setCfgOpen(true); }}>
              <Settings2 size={15} /> Horários e link
            </Button>
          </div>
          {d.providing.calls.length === 0 ? (
            <EmptyState title="Nenhuma call marcada" text="Seus clientes marcam pelo menu Calls, dentro do limite do plano de cada um." />
          ) : (
            <div className="divide-y divide-slate-100">
              {d.providing.calls.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold capitalize text-slate-900">
                      {when(c.startsAt)} · {c.clientName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {c.userName}
                      {c.phone ? ` · ${c.phone}` : ""}
                      {c.topic ? ` · ${c.topic}` : ""}
                    </p>
                  </div>
                  <Badge tone={TONE[c.status]}>{CALL_STATUS_LABEL[c.status]}</Badge>
                  {c.meetingLink && (
                    <a href={c.meetingLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--accent)] hover:underline">
                      Abrir link
                    </a>
                  )}
                  <button onClick={() => setLink(c)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Trocar link">
                    <Link2 size={16} />
                  </button>
                  {c.status === "SCHEDULED" ? (
                    <>
                      <button onClick={() => act(c, "done")} className="rounded p-2 text-emerald-600 hover:bg-emerald-50" title="Marcar como realizada">
                        <Check size={16} />
                      </button>
                      <button onClick={() => act(c, "no_show")} className="rounded p-2 text-amber-600 hover:bg-amber-50" title="Não compareceu">
                        <UserX size={16} />
                      </button>
                      <button onClick={() => act(c, "cancel")} className="rounded p-2 text-red-500 hover:bg-red-50" title="Cancelar">
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => act(c, "reopen")} className="text-xs text-slate-500 hover:underline">
                      Reabrir
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!b && !d.providing && (
        <Card>
          <EmptyState title="Calls indisponíveis para esta conta" />
        </Card>
      )}

      <Modal
        title="Confirmar call"
        open={pick !== null}
        onClose={() => setPick(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPick(null)}>
              Voltar
            </Button>
            <Button onClick={book} disabled={saving}>
              {saving ? "Marcando..." : "Confirmar"}
            </Button>
          </>
        }
      >
        {pick && (
          <div className="space-y-4">
            <ErrorNote message={error} />
            <p className="text-lg font-semibold capitalize text-slate-900">{when(pick)}</p>
            <Field label="Sobre o que quer falar?">
              <Textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: revisar as instruções da IA e o funil" />
            </Field>
            <Field label="Seu WhatsApp" hint="A confirmação e o link chegam por aqui.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="16999998888" />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        title="Horários das calls"
        open={cfgOpen && cfg !== null}
        onClose={() => setCfgOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCfgOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCfg}>Salvar</Button>
          </>
        }
      >
        {cfg && (
          <div className="space-y-4">
            <Field label="Dias e horários livres">
              <ShiftEditor value={cfg.callHours} onChange={(v) => setCfg({ ...cfg, callHours: v })} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Duração de cada call (minutos)">
                <Input type="number" min={15} value={String(cfg.callMinutes)} onChange={(e) => setCfg({ ...cfg, callMinutes: Number(e.target.value) || 30 })} />
              </Field>
              <Field label="Link fixo da reunião" hint="Meet, Zoom... Dá para trocar em cada call.">
                <Input value={cfg.callLink} onChange={(e) => setCfg({ ...cfg, callLink: e.target.value })} placeholder="https://meet.google.com/..." />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
