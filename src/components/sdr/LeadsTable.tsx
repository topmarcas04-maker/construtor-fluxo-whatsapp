"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, MapPin } from "lucide-react";
import type { Lead, Seller, Tag } from "@/lib/types/sdr";
import { CHANNEL_LABEL, CHANNEL_BADGE, TAG_DOT_CLASSES, leadDisplayName } from "@/lib/types/sdr";
import { columnOfLead, funnelOfLead, type FunnelWithColumns } from "@/lib/funnel/common";

interface Props {
  leads: Lead[];
  tags: Tag[];
  sellers: Seller[];
  funnels: FunnelWithColumns[];
  loading: boolean;
  /** Filtro por vendedor: só administradores da conta Master e de Parceiros */
  showSellerFilter: boolean;
  onOpenLead: (leadId: string) => void;
}

type SortKey = "name" | "phone" | "city" | "product" | "column" | "seller" | "score" | "channel" | "createdAt" | "lastAt";

const PERIODS = [
  { key: "todos", label: "Todo o período" },
  { key: "hoje", label: "Hoje" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "90", label: "Últimos 90 dias" },
  { key: "custom", label: "Escolher datas" },
] as const;

const spDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "";
const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

export function LeadsTable({ leads, tags, sellers, funnels, loading, showSellerFilter, onOpenLead }: Props) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [funnelId, setFunnelId] = useState("todos");
  const [columnName, setColumnName] = useState("todas");
  const [sellerId, setSellerId] = useState("todos");
  const [tagId, setTagId] = useState("todas");
  const [channel, setChannel] = useState("todos");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(200);

  // Etapa (coluna do funil), funil e canal de cada lead, calculados uma vez
  const rows = useMemo(
    () =>
      leads.map((l) => {
        const funnel = funnelOfLead(l, funnels);
        const col = funnel ? columnOfLead(l, funnel.columns) : undefined;
        return {
          lead: l,
          name: leadDisplayName(l),
          phone: l.phone || (l.conversation.phoneJid.endsWith("@s.whatsapp.net") ? l.conversation.phoneJid.split("@")[0] : l.conversation.handle || ""),
          funnelId: funnel?.id || "",
          funnelName: funnel?.name || "",
          column: col?.name || "",
          channel: l.conversation.channel || "WHATSAPP",
          lastAt: l.conversation.lastMessageAt || l.updatedAt,
        };
      }),
    [leads, funnels]
  );

  const channels = useMemo(() => [...new Set(rows.map((r) => r.channel))], [rows]);
  const columnNames = useMemo(() => {
    const list = funnelId === "todos" ? funnels : funnels.filter((f) => f.id === funnelId);
    return [...new Set(list.flatMap((f) => f.columns.map((c) => c.name)))];
  }, [funnels, funnelId]);

  const visible = useMemo(() => {
    const today = spDate(new Date().toISOString());
    const since = (days: number) => spDate(new Date(Date.now() - (days - 1) * 864e5).toISOString());
    const [a, b] =
      period === "hoje"
        ? [today, today]
        : period === "7" || period === "30" || period === "90"
        ? [since(Number(period)), today]
        : period === "custom"
        ? [from, to]
        : ["", ""];
    const list = rows.filter((r) => {
      const d = spDate(r.lead.createdAt);
      if (a && d < a) return false;
      if (b && d > b) return false;
      if (funnelId !== "todos" && r.funnelId !== funnelId) return false;
      if (columnName !== "todas" && r.column !== columnName) return false;
      if (showSellerFilter && sellerId !== "todos") {
        if (sellerId === "sem" ? r.lead.seller : r.lead.seller?.id !== sellerId) return false;
      }
      if (tagId !== "todas" && !r.lead.tags.some((t) => t.id === tagId)) return false;
      if (channel !== "todos" && r.channel !== channel) return false;
      return true;
    });
    const val = (r: (typeof rows)[number]): string | number => {
      switch (sort.key) {
        case "name":
          return r.name.toLowerCase();
        case "phone":
          return r.phone;
        case "city":
          return (r.lead.city || "").toLowerCase();
        case "product":
          return (r.lead.product?.name || "").toLowerCase();
        case "column":
          return r.column.toLowerCase();
        case "seller":
          return (r.lead.seller?.name || "").toLowerCase();
        case "score":
          return r.lead.score ?? -1;
        case "channel":
          return r.channel;
        case "lastAt":
          return new Date(r.lastAt).getTime();
        default:
          return new Date(r.lead.createdAt).getTime();
      }
    };
    return [...list].sort((x, y) => {
      const vx = val(x);
      const vy = val(y);
      return (vx < vy ? -1 : vx > vy ? 1 : 0) * sort.dir;
    });
  }, [rows, period, from, to, funnelId, columnName, sellerId, tagId, channel, sort, showSellerFilter]);

  const header = (key: SortKey, label: string, cls = "") => (
    <th className={`whitespace-nowrap px-3 py-2 ${cls}`}>
      <button
        type="button"
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "createdAt" || key === "lastAt" || key === "score" ? -1 : 1 }))}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 ${sort.key === key ? "text-slate-900" : ""}`}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      const headers = [
        "Nome",
        "Telefone",
        "Cidade",
        "Produto de interesse",
        "Funil",
        "Etapa",
        "Vendedor",
        "Etiquetas",
        "Nota",
        "Origem",
        "Entrou em",
        "Última mensagem",
        "Interesse",
        "Resumo da IA",
      ];
      const data = visible.map((r) => [
        r.name,
        r.phone,
        r.lead.city || "",
        r.lead.product?.name || "",
        r.funnelName,
        r.column,
        r.lead.seller?.name || "",
        r.lead.tags.map((t) => t.name).join(", "),
        r.lead.score ?? "",
        CHANNEL_LABEL[r.channel] || r.channel,
        fmtDate(r.lead.createdAt),
        fmtDate(r.lastAt),
        r.lead.interest || "",
        r.lead.aiSummary || "",
      ]);
      const res = await fetch("/api/sdr/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows: data }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Não consegui gerar a planilha");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${spDate(new Date().toISOString())}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 md:px-6">
        <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className={sel} aria-label="Período de entrada">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={sel} aria-label="De" />
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={sel} aria-label="Até" />
          </>
        )}
        {funnels.length > 1 && (
          <select
            value={funnelId}
            onChange={(e) => {
              setFunnelId(e.target.value);
              setColumnName("todas");
            }}
            className={sel}
            aria-label="Funil"
          >
            <option value="todos">Todos os funis</option>
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <select value={columnName} onChange={(e) => setColumnName(e.target.value)} className={sel} aria-label="Etapa">
          <option value="todas">Todas as etapas</option>
          {columnNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {showSellerFilter && (
          <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={sel} aria-label="Vendedor">
            <option value="todos">Todos os vendedores</option>
            <option value="sem">Sem vendedor</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        )}
        {tags.length > 0 && (
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={sel} aria-label="Etiqueta">
            <option value="todas">Todas as etiquetas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {channels.length > 1 && (
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={sel} aria-label="Origem">
            <option value="todos">Todas as origens</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c] || c}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-slate-500">
          <b className="text-slate-800">{visible.length}</b> de {rows.length}
        </span>
        <button
          type="button"
          onClick={exportExcel}
          disabled={exporting || visible.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          title="Baixa em Excel os leads deste filtro"
        >
          <Download size={15} /> {exporting ? "Gerando..." : "Exportar Excel"}
        </button>
      </div>

      {/* Tabela */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-400">Carregando...</p>
        ) : visible.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhum lead neste filtro.</p>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                {header("name", "Nome")}
                {header("phone", "Telefone")}
                {header("city", "Cidade")}
                {header("product", "Produto")}
                {header("column", "Etapa")}
                {header("seller", "Vendedor")}
                <th className="px-3 py-2 uppercase tracking-wide">Etiquetas</th>
                {header("score", "Nota", "text-right")}
                {header("channel", "Origem")}
                {header("createdAt", "Entrou")}
                {header("lastAt", "Última msg")}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.slice(0, limit).map((r) => (
                <tr key={r.lead.id} onClick={() => onOpenLead(r.lead.id)} className="cursor-pointer hover:bg-slate-50" title="Abrir a conversa">
                  <td className="max-w-[220px] px-3 py-2">
                    <p className="truncate font-medium text-slate-900">{r.name}</p>
                    {r.lead.stage === "SALE" && <span className="text-[11px] font-semibold text-emerald-600">Venda</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.phone}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.lead.city && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin size={11} className="text-slate-400" /> {r.lead.city}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">{r.lead.product?.name || ""}</td>
                  <td className="px-3 py-2">
                    {r.column && <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{r.column}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.lead.seller?.name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[180px] flex-wrap gap-1">
                      {r.lead.tags.map((t) => (
                        <span key={t.id} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <span className={`h-2 w-2 rounded-full ${TAG_DOT_CLASSES[t.color] || "bg-slate-400"}`} />
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{r.lead.score ?? ""}</td>
                  <td className="px-3 py-2">
                    {r.channel === "WHATSAPP" ? (
                      <span className="text-xs text-slate-500">WhatsApp</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHANNEL_BADGE[r.channel] || ""}`}>{CHANNEL_LABEL[r.channel] || r.channel}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.lead.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(r.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {visible.length > limit && (
          <div className="p-4 text-center">
            <button type="button" onClick={() => setLimit((n) => n + 300)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Mostrar mais ({visible.length - limit} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
