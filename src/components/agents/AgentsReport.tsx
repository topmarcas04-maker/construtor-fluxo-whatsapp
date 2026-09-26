"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  isPrimary: boolean;
  active: boolean;
  leads: number;
  replies: number;
  qualified: number;
  appointments: number;
  actions: number;
  transfersOut: number;
  transfersIn: number;
  toSellers: number;
  sales: number;
  resolvedPct: number | null;
  minutesToHuman: number | null;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}
interface Report {
  days: number;
  agents: Row[];
  usage: {
    byKind: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }>;
    total: { calls: number; tokensIn: number; tokensOut: number; cost: number };
  };
}

const KIND_LABEL: Record<string, string> = { REPLY: "Respostas dos agentes", ROUTER: "Roteador", FOLLOWUP: "Recontato", TEST: "Testes" };
const n = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mins = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

/** Relatório por agente + consumo de IA da conta */
export function AgentsReport() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/agents/report?days=${days}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha ao carregar");
        if (alive) setData(d);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [days]);

  const cols: { key: keyof Row; label: string; fmt?: (r: Row) => string }[] = [
    { key: "leads", label: "Leads atendidos" },
    { key: "replies", label: "Respostas" },
    { key: "qualified", label: "Qualificados" },
    { key: "appointments", label: "Agendamentos" },
    { key: "transfersOut", label: "Transferiu", fmt: (r) => `${r.transfersOut} ↗ · ${r.transfersIn} ↙` },
    { key: "toSellers", label: "Para vendedores" },
    { key: "sales", label: "Vendas" },
    { key: "resolvedPct", label: "Resolveu sozinho", fmt: (r) => (r.resolvedPct == null ? "—" : `${r.resolvedPct}%`) },
    { key: "minutesToHuman", label: "Tempo até o humano", fmt: (r) => mins(r.minutesToHuman) },
    { key: "cost", label: "Consumo de IA", fmt: (r) => `${usd(r.cost)} · ${n(r.tokensIn + r.tokensOut)} tokens` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${days === d ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Últimos {d} dias
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={15} className="animate-spin" /> Carregando...
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Consumo estimado</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{usd(data.usage.total.cost)}</p>
              <p className="text-xs text-slate-500">
                {n(data.usage.total.calls)} chamadas · {n(data.usage.total.tokensIn + data.usage.total.tokensOut)} tokens
              </p>
            </Card>
            {Object.entries(data.usage.byKind).map(([k, v]) => (
              <Card key={k} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{KIND_LABEL[k] || k}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{usd(v.cost)}</p>
                <p className="text-xs text-slate-500">
                  {n(v.calls)} chamadas · {n(v.tokensIn + v.tokensOut)} tokens
                </p>
              </Card>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Agente</th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-3 py-3 text-right">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.agents.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {r.name}
                      {r.isPrimary && <span className="ml-1.5 text-xs font-normal text-violet-600">principal</span>}
                      {!r.active && <span className="ml-1.5 text-xs font-normal text-slate-400">desativado</span>}
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right text-slate-700">
                        {c.fmt ? c.fmt(r) : n(Number(r[c.key]) || 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-400">
            Os números contam a partir desta atualização. O custo é uma estimativa pelo preço de tabela da Anthropic (em dólar); o valor cobrado de verdade aparece
            no painel de faturamento da Anthropic (console.anthropic.com). &quot;Resolveu sozinho&quot; = leads que o agente atendeu sem passar para vendedor nem
            para outro agente.
          </p>
        </>
      )}
    </div>
  );
}
