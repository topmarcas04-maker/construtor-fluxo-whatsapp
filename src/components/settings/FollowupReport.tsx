"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Reply, UserCheck, Ban, Hourglass, ShieldAlert, Trophy } from "lucide-react";

interface Report {
  summary: {
    entered: number;
    leads: number;
    sent: number;
    replied: number;
    replyRate: number;
    handoff: number;
    sales: number;
    final: number;
    running: number;
    cover: number;
  };
  attempts: { attempt: number; sent: number; replied: number }[];
  byFollowup: { id: string; name: string; entered: number; replied: number; handoff: number; final: number }[];
  cover: { sellerId: string | null; name: string; count: number }[];
  sellers: { id: string; name: string }[];
  leads: {
    leadId: string;
    name: string | null;
    phone: string | null;
    stage: string | null;
    followupName: string;
    seller: string;
    sent: number;
    status: "RUNNING" | "REPLIED" | "HANDOFF" | "FINAL" | "COVER";
    repliedAttempt: number | null;
    at: string;
  }[];
}

const STATUS: Record<Report["leads"][number]["status"], { label: string; cls: string }> = {
  RUNNING: { label: "Em andamento", cls: "bg-slate-100 text-slate-600" },
  REPLIED: { label: "Respondeu", cls: "bg-emerald-50 text-emerald-700" },
  HANDOFF: { label: "Passou p/ vendedor", cls: "bg-sky-50 text-sky-700" },
  FINAL: { label: "Desqualificado", cls: "bg-rose-50 text-rose-700" },
  COVER: { label: "Agente cobriu", cls: "bg-amber-50 text-amber-700" },
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function FollowupReport({ items }: { items: { id: string; name: string }[] }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [followupId, setFollowupId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const qs = new URLSearchParams({ from, to, followupId, sellerId });
    fetch(`/api/sdr/followup/report?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Não consegui carregar o relatório");
        return d as Report;
      })
      .then((d) => !cancel && (setData(d), setError(null)))
      .catch((e) => !cancel && setError((e as Error).message))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [from, to, followupId, sellerId]);

  const leads = useMemo(() => (data?.leads || []).filter((l) => !status || l.status === status), [data, status]);
  const maxSent = Math.max(1, ...(data?.attempts || []).map((a) => a.sent));

  const preset = (n: number) => {
    setFrom(daysAgo(n));
    setTo(today());
  };

  const sm = data?.summary;
  const cards = sm
    ? [
        { label: "Leads no recontato", value: sm.leads, Icon: MessageCircle, cls: "text-slate-700" },
        { label: "Mensagens enviadas", value: sm.sent, Icon: Send, cls: "text-violet-600" },
        { label: `Responderam (${sm.replyRate}%)`, value: sm.replied, Icon: Reply, cls: "text-emerald-600" },
        { label: "Passaram p/ vendedor", value: sm.handoff, Icon: UserCheck, cls: "text-sky-600" },
        { label: "Viraram venda", value: sm.sales, Icon: Trophy, cls: "text-amber-600" },
        { label: "Desqualificados", value: sm.final, Icon: Ban, cls: "text-rose-600" },
        { label: "Em andamento", value: sm.running, Icon: Hourglass, cls: "text-slate-500" },
        { label: "Agente cobriu vendedor", value: sm.cover, Icon: ShieldAlert, cls: "text-orange-600" },
      ]
    : [];

  const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {[7, 30, 90].map((n) => (
            <button key={n} type="button" onClick={() => preset(n)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              {n} dias
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-500">
          De
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`ml-1 ${sel}`} />
        </label>
        <label className="text-xs text-slate-500">
          até
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`ml-1 ${sel}`} />
        </label>
        <select value={followupId} onChange={(e) => setFollowupId(e.target.value)} className={sel} aria-label="Recontato">
          <option value="">Todos os recontatos</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
        <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={sel} aria-label="Vendedor">
          <option value="">Todos os vendedores</option>
          <option value="sem">Sem vendedor</option>
          {(data?.sellers || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading && !data && <p className="text-sm text-slate-400">Carregando...</p>}

      {sm && (
        <>
          <div className={`grid grid-cols-2 gap-2 md:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
            {cards.map(({ label, value, Icon, cls }) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Icon size={14} className={cls} /> {label}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Por tentativa */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Por tentativa</p>
              {data.attempts.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum recontato enviado no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.attempts.map((a) => (
                    <div key={a.attempt}>
                      <div className="mb-1 flex justify-between text-xs text-slate-600">
                        <span className="font-semibold">{a.attempt}ª tentativa</span>
                        <span>
                          {a.sent} enviadas · <b className="text-emerald-600">{a.replied} responderam</b>
                          {a.sent ? ` (${Math.round((a.replied / a.sent) * 100)}%)` : ""}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="relative h-full rounded-full bg-violet-200" style={{ width: `${(a.sent / maxSent) * 100}%` }}>
                          <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${a.sent ? (a.replied / a.sent) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cobertura por vendedor */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-1 text-sm font-semibold text-slate-800">Agente cobriu o vendedor</p>
              <p className="mb-3 text-xs text-slate-500">Quantas vezes o cliente ficou esperando e o agente assumiu.</p>
              {data.cover.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma vez no período.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.cover.map((c) => (
                    <div key={c.sellerId || "sem"} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-slate-700">{c.name}</span>
                      <b className="text-orange-600">{c.count}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Por recontato */}
          {data.byFollowup.length > 1 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Recontato</th>
                    <th className="px-3 py-2 text-right">Entraram</th>
                    <th className="px-3 py-2 text-right">Responderam</th>
                    <th className="px-3 py-2 text-right">P/ vendedor</th>
                    <th className="px-3 py-2 text-right">Desqualificados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byFollowup.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">{b.name}</td>
                      <td className="px-3 py-2 text-right">{b.entered}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{b.replied}</td>
                      <td className="px-3 py-2 text-right text-sky-700">{b.handoff}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{b.final}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Leads */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">Leads ({leads.length})</p>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Situação">
                <option value="">Todas as situações</option>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            {leads.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum lead neste filtro.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Recontato</th>
                      <th className="px-3 py-2">Vendedor</th>
                      <th className="px-3 py-2">Situação</th>
                      <th className="px-3 py-2 text-right">Quando</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leads.map((l, i) => (
                      <tr
                        key={`${l.leadId}-${l.status}-${i}`}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => (window.location.href = `/leads?lead=${l.leadId}`)}
                        title="Abrir a conversa"
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{l.name || l.phone || "Sem nome"}</p>
                          {l.name && l.phone && <p className="text-xs text-slate-400">{l.phone}</p>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {l.followupName}
                          {l.sent > 0 && <span className="text-xs text-slate-400"> · {l.sent} tentativa(s)</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{l.seller}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                          {l.repliedAttempt ? <span className="ml-1 text-xs text-slate-400">na {l.repliedAttempt}ª</span> : null}
                          {l.stage === "SALE" && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Venda</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-500">
                          {new Date(l.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">O relatório conta a partir de hoje: recontatos enviados antes desta atualização não aparecem.</p>
        </>
      )}
    </div>
  );
}
