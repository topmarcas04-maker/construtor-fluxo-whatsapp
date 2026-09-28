"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Sparkles, Type, Clock, CalendarClock, Ban, Tag as TagIcon, Workflow, Info, UserCheck, MessagesSquare, Bell, Undo2, Repeat, ShieldAlert, BarChart3, Bot } from "lucide-react";
import { Button, Field, Input, Textarea, Toggle, Badge, ErrorNote } from "@/components/ui";
import { TAG_COLOR_CLASSES } from "@/lib/types/sdr";
import {
  DEFAULT_COVER,
  MAX_ATTEMPTS,
  MAX_FOLLOWUPS,
  SELLER_SCOPE_LABEL,
  WEEKDAYS,
  fillName,
  newFollowupItem,
  slotAt,
  type CoverSettings,
  type FollowupItem,
  type SellerScope,
} from "@/lib/followup/common";
import { FollowupReport } from "./FollowupReport";

interface Data {
  items: FollowupItem[];
  cover: CoverSettings;
  funnels: { id: string; name: string; columns: { id: string; name: string }[] }[];
  tags: { id: string; name: string; color: string }[];
  agents: { id: string; name: string; active: boolean; isPrimary: boolean }[];
  aiEnabled: boolean;
  hasAiKey: boolean;
  queue: {
    leadId: string;
    name: string | null;
    phone: string;
    kind: "SEND" | "FINAL";
    attempt: number | null;
    total: number;
    followupId: string;
    followupName: string;
    at: string;
    inBot: boolean;
  }[];
}

type Section = "recontatos" | "cobertura" | "relatorio";

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

const fmt = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const BLANK: FollowupItem = { ...newFollowupItem("Recontato"), id: "__blank" };

export function FollowupTab() {
  const [data, setData] = useState<Data | null>(null);
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [cover, setCover] = useState<CoverSettings>(DEFAULT_COVER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("recontatos");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((d: Data) => {
    setData(d);
    setItems(d.items);
    setCover(d.cover);
    setSelectedId((cur) => (cur && d.items.some((it) => it.id === cur) ? cur : d.items[0]?.id || null));
  }, []);
  const load = useCallback(async () => {
    apply(await api("/api/sdr/followup", "GET"));
  }, [apply]);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const s: FollowupItem = items.find((it) => it.id === selectedId) || BLANK;
  const set = (patch: Partial<FollowupItem>) => {
    setSaved(false);
    setItems((list) => list.map((it) => (it.id === s.id ? { ...it, ...patch } : it)));
  };
  const setAttempt = (i: number, patch: Partial<FollowupItem["attempts"][number]>) =>
    set({ attempts: s.attempts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const setCov = (patch: Partial<CoverSettings>) => {
    setSaved(false);
    setCover((c) => ({ ...c, ...patch }));
  };

  const addItem = () => {
    if (items.length >= MAX_FOLLOWUPS) return;
    const hasWith = items.some((it) => it.sellerScope === "WITH");
    const it = newFollowupItem(items.length === 0 ? "Recontato geral" : hasWith ? `Recontato ${items.length + 1}` : "Recontato com vendedor");
    if (items.length > 0 && !hasWith) {
      it.sellerScope = "WITH";
      it.includeWithSeller = true;
      it.includeTeam = true;
      it.replyAction = "HANDOFF";
    }
    setItems((list) => [...list, it]);
    setSelectedId(it.id);
    setSaved(false);
  };
  const removeItem = () => {
    if (!confirm(`Excluir o recontato "${s.name}"? (só vale depois de salvar)`)) return;
    const rest = items.filter((it) => it.id !== s.id);
    setItems(rest);
    setSelectedId(rest[0]?.id || null);
    setSaved(false);
  };
  const move = (dir: -1 | 1) => {
    const i = items.findIndex((it) => it.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const list = [...items];
    [list[i], list[j]] = [list[j], list[i]];
    setItems(list);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      apply(await api("/api/sdr/followup", "PUT", { items, cover }));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Exemplo: última mensagem hoje às 10h
  const timeline = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const rows: { label: string; at: Date }[] = [{ label: "Última mensagem sem resposta", at: start }];
    let base = start;
    s.attempts.forEach((a, i) => {
      const at = slotAt(new Date(base.getTime() + Math.max(1, a.afterHours || 1) * 3600e3), a.time || "09:00", s.days, start);
      rows.push({ label: `Tentativa ${i + 1}`, at });
      base = at;
    });
    if (s.moveToDisqualified || s.addTagName.trim())
      rows.push({ label: s.moveToDisqualified ? `Vai para "${s.disqualifiedColumnName || "Desqualificado"}"` : `Etiqueta "${s.addTagName}"`, at: new Date(base.getTime() + s.finalHours * 3600e3) });
    return rows;
  }, [s]);

  if (!data) return <div className="p-6 text-sm text-slate-400">{error || "Carregando..."}</div>;
  const aiReady = data.aiEnabled && data.hasAiKey;

  const SECTIONS: { key: Section; label: string; Icon: typeof Repeat }[] = [
    { key: "recontatos", label: "Recontatos", Icon: Repeat },
    { key: "cobertura", label: "Cobertura do vendedor", Icon: ShieldAlert },
    { key: "relatorio", label: "Relatório", Icon: BarChart3 },
  ];
  const saveBar = (label: string) => (
    <>
      <ErrorNote message={error} />
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        {saved && <span className="text-sm font-semibold text-emerald-600">Salvo!</span>}
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : label}
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-6 p-5 md:p-6">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {SECTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              section === key ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {section === "relatorio" && <FollowupReport items={items.map((it) => ({ id: it.id, name: it.name }))} />}

      {section === "cobertura" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h3 className="font-semibold text-slate-900">Agente quando o vendedor não atende</h3>
              <p className="mt-1 text-sm text-slate-600">
                Se o lead está com um vendedor e o cliente fica esperando resposta, depois do tempo escolhido um agente de IA assume para o
                cliente não ficar sem atendimento. Assim que o vendedor responder (pelo painel ou pelo celular da empresa), o agente pausa e a
                conversa volta para ele.
              </p>
            </div>
            <Toggle checked={cover.enabled} onChange={(v) => setCov({ enabled: v })} label={cover.enabled ? "Ligado" : "Desligado"} />
          </div>
          {!aiReady && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {data.aiEnabled ? "A conta está sem chave de IA" : "A IA desta conta está desligada"}: sem IA o agente não consegue assumir.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            O agente assume quando o cliente espera o vendedor por
            <input
              type="number"
              min={1}
              max={720}
              value={cover.hours}
              onChange={(e) => setCov({ hours: Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            horas <span className="text-xs text-slate-400">(de 1 a 720 horas = 30 dias)</span>
          </div>
          <Field label="Agente que assume" hint="O agente responde o cliente e diz que o vendedor continua o atendimento assim que puder.">
            <select
              value={cover.agentId || ""}
              onChange={(e) => setCov({ agentId: e.target.value || null })}
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">O agente que já atendia o lead (ou o principal)</option>
              {data.agents
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.isPrimary ? " (principal)" : ""}
                  </option>
                ))}
            </select>
          </Field>
          <div className="space-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cover.notifySeller} onChange={(e) => setCov({ notifySeller: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <Bell size={14} className="text-[var(--accent)]" /> Avisar o vendedor no WhatsApp que o agente assumiu
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cover.onlyOpenHours} onChange={(e) => setCov({ onlyOpenHours: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <Clock size={14} className="text-[var(--accent)]" /> Só assumir dentro do horário dos consultores
            </label>
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Bot size={14} className="mt-0.5 shrink-0" /> Vale só para WhatsApp, leads com vendedor e com a última mensagem do cliente. Nunca
            para venda fechada. Enquanto cobre, o agente não passa o cliente para outro vendedor.
          </p>
          {saveBar("Salvar cobertura")}
        </div>
      )}

      {section === "recontatos" && (
      <>
      <div className="max-w-3xl">
        <h3 className="font-semibold text-slate-900">Recontato automático</h3>
        <p className="mt-1 text-sm text-slate-600">
          Quando o cliente para de responder, o sistema volta a chamar no WhatsApp nos horários que você escolher. Você pode ter vários
          recontatos (ex.: um para leads com vendedor e um geral). Cada lead entra em um só: o primeiro da lista que servir para ele.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setSelectedId(it.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              it.id === s.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${it.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
            {i + 1}. {it.name}
          </button>
        ))}
        {items.length < MAX_FOLLOWUPS && (
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus size={14} /> Novo recontato
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum recontato criado. Clique em <b>Novo recontato</b> para começar.
          {saveBar("Salvar")}
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Field label="Nome do recontato" className="min-w-[220px] flex-1">
          <Input value={s.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="flex items-center gap-1 pb-1">
          <button type="button" onClick={() => move(-1)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" title="Subir na ordem (tem prioridade)">
            ↑
          </button>
          <button type="button" onClick={() => move(1)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" title="Descer na ordem">
            ↓
          </button>
          <button type="button" onClick={removeItem} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-red-500" title="Excluir recontato">
            <Trash2 size={15} />
          </button>
        </div>
        <div className="pb-1">
          <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label={s.enabled ? "Ligado" : "Desligado"} />
        </div>
      </div>

      {/* Quem escreve */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Quem escreve a mensagem</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["AI", Sparkles, "A IA escreve", "Mensagem curta baseada na conversa (produto, dúvida). Usa o texto abaixo se a IA falhar."],
              ["TEXT", Type, "Texto fixo", "Envia o texto de cada tentativa. Ideal para chatbot e contas sem IA."],
            ] as const
          ).map(([k, Icon, title, hint]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ mode: k })}
              className={`flex gap-3 rounded-xl border p-3 text-left transition ${
                s.mode === k ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Icon size={18} className={s.mode === k ? "text-[var(--accent)]" : "text-slate-400"} />
              <span>
                <span className={`block text-sm font-semibold ${s.mode === k ? "text-[var(--accent)]" : "text-slate-800"}`}>{title}</span>
                <span className="text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {s.mode === "AI" && !aiReady && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {data.aiEnabled ? "A conta está sem chave de IA" : "A IA desta conta está desligada"}: enquanto isso, o recontato usa o texto fixo.
          </p>
        )}
        {s.mode === "AI" && (
          <Field label="Orientação para a IA (opcional)" className="mt-3" hint='Ex.: "Ofereça o test-drive no sábado" ou "Lembre que a entrega é grátis na região".'>
            <Input value={s.aiInstructions} onChange={(e) => set({ aiInstructions: e.target.value })} />
          </Field>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <Workflow size={13} /> Se o cliente parou no meio de um menu do chatbot, as opções do menu vão junto com a mensagem.
        </p>
      </div>

      {/* Tentativas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Tentativas e horários</p>
          <span className="text-xs text-slate-400">Use {"{nome}"} para o nome do cliente</span>
        </div>
        <div className="space-y-3">
          {s.attempts.map((a, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">{i + 1}</span>
                <span>Esperar</span>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={a.afterHours}
                  onChange={(e) => setAttempt(i, { afterHours: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <span>horas {i === 0 ? "depois da última mensagem" : "depois da tentativa anterior"} e enviar às</span>
                <input
                  type="time"
                  value={a.time}
                  onChange={(e) => setAttempt(i, { time: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => s.attempts.length > 1 && set({ attempts: s.attempts.filter((_, j) => j !== i) })}
                  disabled={s.attempts.length <= 1}
                  className="ml-auto rounded p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  title="Excluir tentativa"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <Textarea
                rows={2}
                className="mt-2"
                value={a.text}
                onChange={(e) => setAttempt(i, { text: e.target.value })}
                placeholder={s.mode === "AI" ? "Texto de reserva (se a IA falhar)" : "Mensagem desta tentativa"}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {s.mode === "AI" ? "A IA escreve a mensagem; este texto é o de reserva." : "Prévia: "}
                {s.mode === "TEXT" && <span className="text-slate-600">{fillName(a.text, "Mariana")}</span>}
              </p>
            </div>
          ))}
        </div>
        {s.attempts.length < MAX_ATTEMPTS && (
          <button
            type="button"
            onClick={() => {
              const last = s.attempts[s.attempts.length - 1];
              set({ attempts: [...s.attempts, { afterHours: last?.afterHours || 48, time: "11:00", text: "Oi, {nome}! Ainda posso te ajudar?" }] });
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            <Plus size={15} /> Adicionar tentativa
          </button>
        )}
      </div>

      {/* Dias */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Dias em que pode enviar</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const on = s.days.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => set({ days: on ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-400">Se o horário cair num dia desmarcado, vai para o próximo dia permitido, no mesmo horário.</p>
      </div>

      {/* Linha do tempo */}
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <CalendarClock size={15} /> Exemplo de como fica
        </p>
        <ol className="space-y-1.5">
          {timeline.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${i === 0 ? "bg-slate-400" : i === timeline.length - 1 && r.label.startsWith("Vai") ? "bg-rose-500" : "bg-[var(--accent)]"}`} />
              <span className="w-56 text-slate-700">{r.label}</span>
              <span className="font-medium capitalize text-slate-900">{fmt(r.at)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-slate-400">Cada lead tem alguns minutos de variação, para não sair tudo no mesmo minuto.</p>
      </div>

      {/* Quem recebe */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Quem recebe</p>
        <div className="space-y-2 text-sm text-slate-700">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info size={13} /> Só WhatsApp (no Instagram/Facebook a Meta não permite mensagem automática depois de 24h). Nunca vai para venda fechada.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.includeTeam} onChange={(e) => set({ includeTeam: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Incluir leads que estão com a equipe (agente pausado ou chatbot passou para a equipe)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(["WITHOUT", "WITH", "ALL"] as SellerScope[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set({ sellerScope: k, includeWithSeller: k !== "WITHOUT" })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  s.sellerScope === k ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {SELLER_SCOPE_LABEL[k]}
              </button>
            ))}
          </div>
          {s.sellerScope === "WITH" && !s.includeTeam && (
            <p className="text-xs text-amber-700">Dica: marque a opção acima, porque lead com vendedor normalmente está com o agente pausado.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            Só leads com nota até
            <input
              type="number"
              min={0}
              max={100}
              value={s.maxScore ?? ""}
              placeholder="todas"
              onChange={(e) => set({ maxScore: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <span className="text-xs text-slate-400">(vazio = todos; ex.: 50 para só os frios)</span>
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Só nestas colunas (opcional)</p>
          <div className="space-y-1.5">
            {data.funnels.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-1.5">
                {data.funnels.length > 1 && <span className="mr-1 text-xs font-semibold text-slate-500">{f.name}:</span>}
                {f.columns.map((c) => {
                  const on = s.columnIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set({ columnIds: on ? s.columnIds.filter((x) => x !== c.id) : [...s.columnIds, c.id] })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {data.tags.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Não enviar para quem tem a etiqueta</p>
            <div className="flex flex-wrap gap-1.5">
              {data.tags.map((t) => {
                const on = s.skipTagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => set({ skipTagIds: on ? s.skipTagIds.filter((x) => x !== t.id) : [...s.skipTagIds, t.id] })}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      on ? TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.blue : "border-slate-200 text-slate-400"
                    }`}
                  >
                    <TagIcon size={11} /> {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Final */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Depois da última tentativa sem resposta</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          Esperar
          <input
            type="number"
            min={0}
            max={720}
            value={s.finalHours}
            onChange={(e) => set({ finalHours: Number(e.target.value) })}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          horas e então:
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={s.moveToDisqualified} onChange={(e) => set({ moveToDisqualified: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <Ban size={14} className="text-rose-500" /> Mover o card para a coluna
            </label>
            <Input className="mt-2" value={s.disqualifiedColumnName} onChange={(e) => set({ disqualifiedColumnName: e.target.value })} disabled={!s.moveToDisqualified} />
            <p className="mt-1 text-[11px] text-slate-400">Se o funil do lead não tiver essa coluna, ela é criada.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <TagIcon size={14} /> Colocar a etiqueta
            </p>
            <Input className="mt-2" value={s.addTagName} onChange={(e) => set({ addTagName: e.target.value })} placeholder="Vazio = sem etiqueta" />
            <p className="mt-1 text-[11px] text-slate-400">Criada automaticamente se não existir.</p>
          </div>
        </div>
      </div>

      {/* Quando responder */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Quando o cliente responder ao recontato</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["CONTINUE", MessagesSquare, "Continuar a conversa", "A IA (ou o chatbot, ou a equipe) segue o atendimento de onde parou."],
              ["HANDOFF", UserCheck, "Passar para o vendedor", "A IA para de responder e o cliente vai direto para um vendedor."],
            ] as const
          ).map(([k, Icon, title, hint]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ replyAction: k })}
              className={`flex gap-3 rounded-xl border p-3 text-left transition ${
                s.replyAction === k ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Icon size={18} className={s.replyAction === k ? "text-[var(--accent)]" : "text-slate-400"} />
              <span>
                <span className={`block text-sm font-semibold ${s.replyAction === k ? "text-[var(--accent)]" : "text-slate-800"}`}>{title}</span>
                <span className="text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        {s.replyAction === "HANDOFF" && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="space-y-1.5 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="radio" checked={s.replySameSeller} onChange={() => set({ replySameSeller: true })} className="h-4 w-4 accent-[var(--accent)]" />
                Se o lead já tinha vendedor, volta para o mesmo vendedor
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!s.replySameSeller} onChange={() => set({ replySameSeller: false })} className="h-4 w-4 accent-[var(--accent)]" />
                Sempre escolher pela fila de rodízio / regras de distribuição
              </label>
            </div>
            <Field label="Mensagem para o cliente ao transferir" hint="Use {nome} e {vendedor}. Vazio = transfere sem mandar mensagem.">
              <Textarea rows={2} value={s.replyHandoffMessage} onChange={(e) => set({ replyHandoffMessage: e.target.value })} />
            </Field>
            <p className="text-[11px] text-slate-400">Sem vendedor ativo cadastrado, a conversa segue normal com a IA.</p>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={s.replyNotifySeller} onChange={(e) => set({ replyNotifySeller: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <Bell size={14} className="text-[var(--accent)]" /> Avisar o vendedor no WhatsApp
            </label>
            <p className="mt-1 text-[11px] text-slate-400">Manda para o vendedor do lead o nome, a mensagem do cliente e o link da conversa.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={s.replyRescue} onChange={(e) => set({ replyRescue: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <Undo2 size={14} className="text-[var(--accent)]" /> Tirar de &quot;{s.disqualifiedColumnName || "Desqualificado"}&quot;
            </label>
            <p className="mt-1 text-[11px] text-slate-400">Se respondeu depois de desqualificado, o card volta para a etapa em que estava e perde a etiqueta de sem resposta.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <TagIcon size={14} /> Colocar a etiqueta
            </p>
            <Input className="mt-2" value={s.replyTagName} onChange={(e) => set({ replyTagName: e.target.value })} placeholder="Vazio = sem etiqueta" />
            <p className="mt-1 text-[11px] text-slate-400">Ex.: &quot;Reativado&quot;. Criada automaticamente se não existir.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Workflow size={14} /> Mover o card para
            </p>
            <select
              value={s.replyColumnId || ""}
              onChange={(e) => set({ replyColumnId: e.target.value || null })}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Não mover</option>
              {data.funnels.map((f) => (
                <optgroup key={f.id} label={f.name}>
                  {f.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>

      {saveBar("Salvar recontatos")}
      </>
      )}

      {/* Fila */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Clock size={15} /> Próximos recontatos {items.some((it) => !it.enabled) && <Badge tone="amber">desligados aparecem só como prévia</Badge>}
        </p>
        {data.queue.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum lead aguardando recontato agora.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {data.queue.map((q) => (
              <div key={q.leadId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{q.name || q.phone}</span>
                {items.length > 1 && <Badge tone="gray">{q.followupName}</Badge>}
                {q.inBot && <Badge tone="blue">no chatbot</Badge>}
                {q.kind === "SEND" ? (
                  <Badge tone="purple">
                    Tentativa {q.attempt}/{q.total}
                  </Badge>
                ) : (
                  <Badge tone="red">Desqualificar</Badge>
                )}
                <span className="w-40 text-right capitalize text-slate-600">{fmt(new Date(q.at))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
