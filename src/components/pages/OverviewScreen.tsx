"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BadgeDollarSign,
  CalendarCheck,
  TrendingUp,
  Bot,
  Clock,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  CalendarPlus,
  Trophy,
} from "lucide-react";
import { Card } from "@/components/ui";
import { ACCOUNT_TYPE_LABEL } from "@/lib/auth/modules";

type PeriodKey = "month" | "lastMonth" | "7d" | "today" | "custom";

interface Overview {
  period: { from: string; to: string };
  scope: { id: string; name: string; type: string; accounts: number };
  kpis: {
    sales: { count: number; value: number };
    appointments: { count: number; done: number; upcoming: number };
    leads: { count: number };
    ai: { conversations: number };
    hot: { count: number };
    conversion: number;
  };
  attention: { key: string; count: number; title: string; detail: string; href: string }[];
  updates: { kind: "sale" | "appointment" | "lead"; at: string; title: string; account: string; value: number | null }[];
  byAccount: { id: string; name: string; type: string; own: boolean; leads: number; sales: number; value: number; appointments: number; ai: number }[];
  bySeller: { id: string; name: string; account_name: string; leads: number; sales: number; value: number; appointments: number }[];
}

interface Me {
  name: string;
  role: string;
  sellerId: string | null;
  account: { id: string; name: string; type: string };
  canManage: boolean;
}

interface TreeAccount {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pad = (n: number) => String(n).padStart(2, "0");

/** "Hoje" no horário de Brasília */
function spToday() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // AAAA-MM-DD
}
function spStart(date: string) {
  return new Date(`${date}T00:00:00-03:00`);
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function periodRange(key: PeriodKey, custom: { from: string; to: string }) {
  const today = spToday();
  const [y, m] = today.split("-").map(Number);
  switch (key) {
    case "today":
      return { from: spStart(today), to: spStart(addDays(today, 1)) };
    case "7d":
      return { from: spStart(addDays(today, -6)), to: spStart(addDays(today, 1)) };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: spStart(`${py}-${pad(pm)}-01`), to: spStart(`${y}-${pad(m)}-01`) };
    }
    case "custom":
      return { from: spStart(custom.from), to: spStart(addDays(custom.to, 1)) };
    default: {
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return { from: spStart(`${y}-${pad(m)}-01`), to: spStart(`${ny}-${pad(nm)}-01`) };
    }
  }
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "Este mês" },
  { key: "lastMonth", label: "Mês passado" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "today", label: "Hoje" },
  { key: "custom", label: "Personalizado" },
];

const UPDATE_META = {
  sale: { icon: BadgeDollarSign, label: "Venda fechada", tone: "bg-emerald-50 text-emerald-600" },
  appointment: { icon: CalendarPlus, label: "Agendamento criado", tone: "bg-sky-50 text-sky-600" },
  lead: { icon: UserPlus, label: "Novo lead", tone: "bg-violet-50 text-violet-600" },
} as const;

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <p className="mb-3 text-[15px] text-slate-500">{label}</p>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon size={20} />
        </span>
        <p className="text-[28px] font-semibold leading-none text-slate-900">{value}</p>
      </div>
      {sub && <p className="mt-3 text-sm text-slate-500">{sub}</p>}
    </Card>
  );
}

export function OverviewScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [tree, setTree] = useState<TreeAccount[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [custom, setCustom] = useState(() => ({ from: addDays(spToday(), -29), to: spToday() }));
  const [scope, setScope] = useState("all");
  const [sellerId, setSellerId] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((u: Me) => {
        setMe(u);
        if (u.canManage) {
          fetch("/api/accounts/tree")
            .then((r) => r.json())
            .then((d) => setTree(d.accounts || []));
        }
      });
    fetch("/api/sdr/sellers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSellers);
  }, []);

  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), scope });
    if (sellerId) params.set("sellerId", sellerId);
    const res = await fetch(`/api/dashboard/overview?${params}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) setError(d.error || "Não foi possível carregar");
    else setData(d);
    setLoading(false);
  }, [range, scope, sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Contas que posso filtrar: a ativa e tudo abaixo dela
  const scopeOptions = useMemo(() => {
    if (!me || tree.length === 0) return [];
    const children = new Map<string, TreeAccount[]>();
    for (const a of tree) if (a.parentId) children.set(a.parentId, [...(children.get(a.parentId) || []), a]);
    const out: { id: string; label: string }[] = [];
    const walk = (id: string, depth: number) => {
      for (const c of (children.get(id) || []).sort((x, y) => x.name.localeCompare(y.name))) {
        out.push({ id: c.id, label: `${"— ".repeat(depth)}${c.name} (${ACCOUNT_TYPE_LABEL[c.type]})` });
        walk(c.id, depth + 1);
      }
    };
    walk(me.account.id, 0);
    return out;
  }, [me, tree]);

  const k = data?.kpis;
  const firstName = me?.name.split(" ")[0] || "";
  const periodLabel =
    period === "custom"
      ? `${custom.from.split("-").reverse().join("/")} a ${custom.to.split("-").reverse().join("/")}`
      : PERIODS.find((p) => p.key === period)?.label;
  const showAccounts = (data?.byAccount.length || 0) > 1;
  const isSeller = me?.role === "SELLER" && me.sellerId;

  return (
    <div className="px-8 py-7">
      {/* Cabeçalho */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold text-[var(--accent)]">Olá{firstName ? `, ${firstName}` : ""}!</h1>
          <p className="mt-1 text-[15px] text-slate-600">Acompanhe o que importa no seu negócio e veja rapidamente onde sua atenção é necessária.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
            <Clock size={16} className="text-slate-500" />
            <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="bg-transparent font-medium text-slate-800 outline-none">
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="outline-none" />
              <span className="text-slate-400">até</span>
              <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="outline-none" />
            </div>
          )}
          {scopeOptions.length > 0 && (
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm outline-none"
            >
              <option value="all">Todas as contas</option>
              <option value={me!.account.id}>Só {me!.account.name}</option>
              {scopeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {!isSeller && sellers.length > 0 && (scope === "all" || scope === me?.account.id) && (
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm outline-none"
            >
              <option value="">Todos os vendedores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {/* Destaque */}
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-6 rounded-2xl p-7 text-white shadow-sm"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 70%, #0b1220) 0%, color-mix(in srgb, var(--accent) 95%, #0b1220) 100%)" }}
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            {ACCOUNT_TYPE_LABEL[data?.scope.type || me?.account.type || "MASTER"]}
            {data && data.scope.accounts > 1 ? ` · ${data.scope.accounts} contas` : ""}
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
            {sellerId ? `Vendedor: ${sellers.find((s) => s.id === sellerId)?.name}` : "Resultados"}
          </p>
          <p className="mt-1 truncate text-[30px] font-bold leading-tight">{data?.scope.name || me?.account.name || "…"}</p>
          <p className="mt-1 text-sm text-white/70">
            {periodLabel} · {brl(k?.sales.value || 0)} em vendas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-8">
          <div className="w-64">
            <p className="text-sm text-white/80">
              <span className="mr-2 text-[30px] font-bold text-white">{(k?.conversion || 0).toLocaleString("pt-BR")}%</span>
              de conversão
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/20">
              <div className="h-1.5 rounded-full bg-white/80" style={{ width: `${Math.min(100, k?.conversion || 0)}%` }} />
            </div>
            <p className="mt-2 text-right text-xs text-white/60">
              {k?.sales.count || 0} vendas de {k?.leads.count || 0} leads
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/leads" className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-white/90">
              Ver leads <ArrowRight size={16} />
            </Link>
            <Link href="/agenda" className="flex items-center justify-center gap-2 rounded-xl border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              Abrir agenda
            </Link>
          </div>
        </div>
      </div>

      {/* Números */}
      <div className={`mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
        <Kpi icon={BadgeDollarSign} label="Vendas" value={k?.sales.count ?? "—"} sub={brl(k?.sales.value || 0)} />
        <Kpi
          icon={CalendarCheck}
          label="Agendamentos"
          value={k?.appointments.count ?? "—"}
          sub={`${k?.appointments.done || 0} realizados · ${k?.appointments.upcoming || 0} a seguir`}
        />
        <Kpi icon={TrendingUp} label="Leads gerados" value={k?.leads.count ?? "—"} sub={`${k?.hot.count || 0} quentes agora`} />
        <Kpi icon={Bot} label="Atendidos pela IA" value={k?.ai.conversations ?? "—"} sub="conversas com resposta da IA" />
      </div>

      {/* Atenção + Atualizações */}
      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card className="overflow-hidden border-amber-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <Bell size={19} className="text-slate-700" />
              <div>
                <p className="font-semibold text-slate-900">Sua atenção</p>
                <p className="text-sm text-slate-500">Pendências que precisam de uma ação sua.</p>
              </div>
            </div>
            {(data?.attention.length || 0) > 0 && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-100 px-2 text-sm font-semibold text-amber-800">
                {data!.attention.reduce((s, a) => s + a.count, 0)}
              </span>
            )}
          </div>
          {!data || data.attention.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <CheckCircle2 size={30} className="mb-2 text-emerald-500" />
              <p className="font-semibold text-slate-800">Tudo em dia</p>
              <p className="text-sm text-slate-500">Nenhuma pendência agora.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.attention.map((a) => (
                <Link key={a.key} href={a.href} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <AlertTriangle size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {a.count} · {a.title}
                    </p>
                    <p className="text-sm text-slate-500">{a.detail}</p>
                  </div>
                  <ArrowRight size={16} className="text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <ListChecks size={19} className="text-slate-700" />
            <div>
              <p className="font-semibold text-slate-900">Últimas atualizações</p>
              <p className="text-sm text-slate-500">O que aconteceu por último.</p>
            </div>
          </div>
          {!data || data.updates.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nada por aqui ainda.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.updates.map((u, i) => {
                const meta = UPDATE_META[u.kind];
                const Icon = meta.icon;
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.tone}`}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{meta.label}</p>
                      <p className="truncate text-sm text-slate-500">
                        {u.title}
                        {u.value ? ` · ${brl(u.value)}` : ""}
                        {showAccounts ? ` · ${u.account}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-slate-400">
                      {new Date(u.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Desempenho */}
      <div className={`grid gap-5 ${showAccounts ? "xl:grid-cols-2" : ""}`}>
        {showAccounts && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="font-semibold text-slate-900">
                Desempenho por {data!.scope.type === "MASTER" ? "parceiro" : "cliente"}
              </p>
              <p className="text-sm text-slate-500">Números reais de cada conta no período (cada parceiro soma os clientes dele).</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Conta</th>
                    <th className="px-3 py-3 text-right">Leads</th>
                    <th className="px-3 py-3 text-right">Agend.</th>
                    <th className="px-3 py-3 text-right">Vendas</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data!.byAccount.map((a) => (
                    <tr key={a.id} className={a.own ? "bg-slate-50/50" : ""}>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => !a.own && setScope(a.id)}
                          className={`text-left font-medium ${a.own ? "text-slate-600" : "text-slate-900 hover:text-[var(--accent)]"}`}
                          title={a.own ? undefined : "Ver só esta conta"}
                        >
                          {a.name}
                        </button>
                        <p className="text-xs text-slate-400">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{a.leads}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{a.appointments}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{a.sales}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{brl(a.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <Trophy size={19} className="text-amber-500" />
            <div>
              <p className="font-semibold text-slate-900">Desempenho por vendedor</p>
              <p className="text-sm text-slate-500">Leads recebidos, agendamentos e vendas de cada vendedor no período.</p>
            </div>
          </div>
          {!data || data.bySeller.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nenhum vendedor cadastrado ainda (Configurações → Vendedores).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Vendedor</th>
                    <th className="px-3 py-3 text-right">Leads</th>
                    <th className="px-3 py-3 text-right">Agend.</th>
                    <th className="px-3 py-3 text-right">Vendas</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bySeller.map((s, i) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {i === 0 && s.sales > 0 ? "🥇 " : ""}
                          {s.name}
                        </p>
                        {showAccounts && <p className="text-xs text-slate-400">{s.account_name}</p>}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{s.leads}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{s.appointments}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{s.sales}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{brl(Number(s.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
