"use client";

import { useState } from "react";
import { Bot, MessageSquare, MapPin, UserRound, Package, Pencil, Plus, ChevronLeft, ChevronRight, Trash2, X, Sparkles } from "lucide-react";
import type { Lead, Seller } from "@/lib/types/sdr";
import { leadDisplayName, TAG_DOT_CLASSES } from "@/lib/types/sdr";
import { columnOfLead, funnelOfLead, COLUMN_COLORS, type FunnelColumn, type FunnelWithColumns } from "@/lib/funnel/common";

interface Props {
  leads: Lead[];
  sellers: Seller[];
  funnels: FunnelWithColumns[];
  funnelId: string | null;
  onSelectFunnel: (id: string) => void;
  onFunnelsChanged: (list: FunnelWithColumns[]) => void;
  onLeadUpdated: () => void;
  onOpenConversation: (leadId: string) => void;
  canEdit: boolean;
  /** Pode criar/renomear/apagar colunas */
  canManageColumns: boolean;
}

/** Cor padrão das colunas fixas */
const KIND_COLOR: Record<string, string> = {
  FIRST_CONTACT: "cyan",
  SECOND_CONTACT: "violet",
  HOT_LEAD: "orange",
  SALE: "emerald",
  CUSTOM: "slate",
};

export const DOT_CLASS: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  cyan: "bg-sky-500",
};

export function columnDot(c: { color: string | null; kind: string }) {
  return DOT_CLASS[c.color || KIND_COLOR[c.kind] || "slate"] || "bg-slate-400";
}

const KIND_HINT: Record<string, string> = {
  FIRST_CONTACT: "Coluna fixa: todo lead novo começa aqui.",
  SECOND_CONTACT: "Coluna fixa: a IA move para cá quando a conversa avança.",
  HOT_LEAD: "Coluna fixa: a IA move para cá quando o cliente quer comprar, agenda ou é passado ao vendedor.",
  SALE: "Coluna fixa: vendas fechadas. Só uma pessoa move o card para cá, e a IA para de responder.",
};

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || "Não foi possível salvar");
  return data;
}

function ColumnEditor({
  column,
  funnelId,
  onClose,
  onSaved,
}: {
  column: FunnelColumn | null;
  funnelId: string | null;
  onClose: () => void;
  onSaved: (cols: FunnelColumn[]) => void;
}) {
  const [name, setName] = useState(column?.name || "");
  const [color, setColor] = useState(column?.color || (column ? KIND_COLOR[column.kind] : "blue") || "blue");
  const [aiRule, setAiRule] = useState(column?.aiRule || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCustom = !column || column.kind === "CUSTOM";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, color };
      if (!column || column.kind !== "SALE") body.aiRule = isCustom ? aiRule : undefined;
      onSaved(column ? await api(`/api/sdr/columns/${column.id}`, "PATCH", body) : await api("/api/sdr/columns", "POST", { ...body, funnelId }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!column || !confirm(`Apagar a coluna "${column.name}"? Os leads dela voltam para a coluna da etapa em que estão.`)) return;
    try {
      onSaved(await api(`/api/sdr/columns/${column.id}`, "DELETE"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{column ? "Editar coluna" : "Nova coluna"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nome</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ligação, Aguardando pagamento..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div>
            <span className="text-sm font-medium text-slate-700">Cor</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${DOT_CLASS[c]} ${color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {isCustom ? (
            <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Sparkles size={14} className="text-violet-600" /> A IA coloca o lead aqui quando... (opcional)
              </span>
              <textarea
                value={aiRule}
                onChange={(e) => setAiRule(e.target.value)}
                rows={3}
                placeholder="Ex.: O cliente pediu para receber uma ligação."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <span className="mt-1 block text-xs text-slate-500">Deixe vazio para só a equipe mover os cards para esta coluna.</span>
            </label>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{KIND_HINT[column!.kind]}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          {column?.kind === "CUSTOM" ? (
            <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Apagar
            </button>
          ) : (
            <span />
          )}
          <button onClick={save} disabled={saving || !name.trim()} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Criar / renomear / apagar funil */
function FunnelEditor({
  funnel,
  onClose,
  onSaved,
}: {
  funnel: FunnelWithColumns | null;
  onClose: () => void;
  onSaved: (list: FunnelWithColumns[]) => void;
}) {
  const [name, setName] = useState(funnel?.name || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(funnel ? await api(`/api/sdr/funnels/${funnel.id}`, "PATCH", { name }) : await api("/api/sdr/funnels", "POST", { name }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!funnel || !confirm(`Apagar o funil "${funnel.name}"? Os cards dele voltam para o funil principal, na mesma etapa.`)) return;
    try {
      onSaved(await api(`/api/sdr/funnels/${funnel.id}`, "DELETE"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{funnel ? "Editar funil" : "Novo funil"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nome</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && save()}
              placeholder="Ex.: Scooters, Planos, Serviços"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          {!funnel && (
            <p className="text-xs text-slate-500">
              O funil novo começa com as etapas Primeiro contato, Interessado, Lead quente e Vendas. Depois você cria as colunas que quiser.
              Para os leads entrarem nele sozinhos, ligue a categoria de produtos a este funil em Produtos.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          {funnel && !funnel.isDefault ? (
            <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={15} /> Apagar
            </button>
          ) : (
            <span />
          )}
          <button onClick={save} disabled={saving || !name.trim()} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FunnelView({
  leads: allLeads,
  sellers,
  funnels,
  funnelId,
  onSelectFunnel,
  onFunnelsChanged,
  onLeadUpdated,
  onOpenConversation,
  canEdit,
  canManageColumns,
}: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<FunnelColumn | "new" | null>(null);
  const [editingFunnel, setEditingFunnel] = useState<FunnelWithColumns | "new" | null>(null);
  const current = funnels.find((f) => f.id === funnelId) || funnels.find((f) => f.isDefault) || funnels[0];
  const columns = current?.columns || [];
  const leads = allLeads.filter((l) => funnelOfLead(l, funnels)?.id === current?.id);
  const onColumnsChanged = (cols: FunnelColumn[]) =>
    onFunnelsChanged(funnels.map((f) => (f.id === current?.id ? { ...f, columns: cols } : f)));

  const move = async (index: number, dir: -1 | 1) => {
    const ids = columns.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      onColumnsChanged(await api("/api/sdr/columns/reorder", "POST", { ids, funnelId: current?.id }));
    } catch {}
  };

  const patchLead = async (leadId: string, fields: Record<string, unknown>) => {
    await fetch(`/api/sdr/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    onLeadUpdated();
  };

  const countIn = (f: FunnelWithColumns) => allLeads.filter((l) => funnelOfLead(l, funnels)?.id === f.id).length;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {(funnels.length > 1 || canManageColumns) && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:px-6">
          {funnels.map((f) => (
            <span
              key={f.id}
              className={`group/f inline-flex shrink-0 items-center rounded-full border text-sm font-medium transition ${
                f.id === current?.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <button onClick={() => onSelectFunnel(f.id)} className="py-1.5 pl-3.5 pr-2">
                {f.name} <span className="opacity-70">({countIn(f)})</span>
              </button>
              {canManageColumns && (
                <button onClick={() => setEditingFunnel(f)} className="rounded-full py-1.5 pr-2.5 opacity-60 hover:opacity-100" title="Renomear ou apagar funil">
                  <Pencil size={12} />
                </button>
              )}
            </span>
          ))}
          {canManageColumns && (
            <button
              onClick={() => setEditingFunnel("new")}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Plus size={14} /> Novo funil
            </button>
          )}
        </div>
      )}
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-3 md:p-6">
      {columns.map((column, index) => {
        const columnLeads = leads.filter((l) => columnOfLead(l, columns)?.id === column.id);
        const total = columnLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);

        return (
          <div
            key={column.id}
            className={`group/col flex w-[280px] min-w-[280px] flex-1 flex-col rounded-2xl border bg-slate-100/70 transition md:w-auto md:min-w-[270px] ${
              dragOver === column.id ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-slate-200"
            }`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver(column.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              setDragOver(null);
              const leadId = e.dataTransfer.getData("text/lead-id");
              if (leadId) patchLead(leadId, { columnId: column.id });
            }}
          >
            <div className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-800">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${columnDot(column)}`} />
                  <span className="truncate">{column.name}</span>
                  {column.aiRule && (
                    <span title={`A IA coloca aqui: ${column.aiRule}`} className="text-violet-500">
                      <Sparkles size={13} />
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {canManageColumns && (
                    <span className="flex items-center md:hidden md:group-hover/col:flex">
                      <button onClick={() => move(index, -1)} disabled={index === 0} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" title="Mover para a esquerda">
                        <ChevronLeft size={15} />
                      </button>
                      <button onClick={() => move(index, 1)} disabled={index === columns.length - 1} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" title="Mover para a direita">
                        <ChevronRight size={15} />
                      </button>
                      <button onClick={() => setEditing(column)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" title="Editar coluna">
                        <Pencil size={14} />
                      </button>
                    </span>
                  )}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{columnLeads.length}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{currency(total)}</p>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
              {columnLeads.map((lead) => {
                const name = leadDisplayName(lead);
                return (
                  <div
                    key={lead.id}
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
                    className={`${canEdit ? "cursor-grab active:cursor-grabbing" : ""} rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)]">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className={`truncate text-slate-800 ${(lead.unread || 0) > 0 ? "font-bold" : "font-semibold"}`}>{name}</span>
                        {(lead.unread || 0) > 0 && (
                          <span
                            className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white"
                            title={`${lead.unread} mensagem(ns) não lida(s)`}
                          >
                            {(lead.unread || 0) > 99 ? "99+" : lead.unread}
                          </span>
                        )}
                        {!(lead.unread || 0) && lead.lastMessage?.direction === "IN" && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Sem resposta: a última mensagem é do cliente" />
                        )}
                      </div>
                      {lead.score !== null && (
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                            lead.score >= 70
                              ? "bg-emerald-50 text-emerald-700"
                              : lead.score >= 40
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                          title="Nota de qualificação da IA"
                        >
                          {lead.score}
                        </span>
                      )}
                    </div>

                    {lead.product && (
                      <p className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                        <Package size={12} className="shrink-0" /> <span className="truncate">{lead.product.name}</span>
                      </p>
                    )}
                    {lead.lastAction && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700" title="Última ação feita pela IA">
                        ⚡ {lead.lastAction}
                      </p>
                    )}
                    {lead.interest && lead.interest !== lead.product?.name && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{lead.interest}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {lead.city && (
                        <span className="inline-flex items-center gap-0.5 text-slate-500">
                          <MapPin size={11} /> {lead.city}
                        </span>
                      )}
                      {lead.seller ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                          <UserRound size={11} /> {lead.seller.name}
                        </span>
                      ) : !lead.aiPaused ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                          <Bot size={11} /> IA
                        </span>
                      ) : null}
                      {lead.tags.map((tag) => (
                        <span
                          key={tag.id}
                          title={tag.name}
                          className={`h-2 w-2 rounded-full ${TAG_DOT_CLASSES[tag.color] || "bg-slate-400"}`}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <select
                        disabled={!canEdit}
                        value={lead.seller?.id || ""}
                        onChange={(e) => patchLead(lead.id, { sellerId: e.target.value || null })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                      >
                        <option value="">Sem vendedor</option>
                        {sellers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onOpenConversation(lead.id)}
                        title="Abrir conversa"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <MessageSquare size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {columnLeads.length === 0 && (
                <p className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
                  Arraste um lead para cá
                </p>
              )}
            </div>
          </div>
        );
      })}
      {canManageColumns && (
        <button
          onClick={() => setEditing("new")}
          className="flex w-[200px] min-w-[200px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Plus size={22} /> Nova coluna
        </button>
      )}
      {editingFunnel && (
        <FunnelEditor
          funnel={editingFunnel === "new" ? null : editingFunnel}
          onClose={() => setEditingFunnel(null)}
          onSaved={(list) => {
            const added = editingFunnel === "new" ? list.find((f) => !funnels.some((o) => o.id === f.id)) : null;
            onFunnelsChanged(list);
            if (added) onSelectFunnel(added.id);
          }}
        />
      )}
      {editing && (
        <ColumnEditor
          funnelId={current?.id || null}
          column={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onColumnsChanged}
        />
      )}
    </div>
    </div>
  );
}
