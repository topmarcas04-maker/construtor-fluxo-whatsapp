"use client";

import { useState } from "react";
import { Bot, MessageSquare, MapPin, UserRound } from "lucide-react";
import type { Lead, Seller } from "@/lib/types/sdr";
import { FUNNEL_COLUMNS, funnelColumn, leadDisplayName, TAG_DOT_CLASSES } from "@/lib/types/sdr";

interface Props {
  leads: Lead[];
  sellers: Seller[];
  onLeadUpdated: () => void;
  onOpenConversation: (leadId: string) => void;
  canEdit: boolean;
}

const COLUMN_COLORS: Record<string, string> = {
  FIRST_CONTACT: "bg-sky-500",
  SECOND_CONTACT: "bg-violet-500",
  HOT_LEAD: "bg-orange-500",
  SALE: "bg-emerald-500",
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FunnelView({ leads, sellers, onLeadUpdated, onOpenConversation, canEdit }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const patchLead = async (leadId: string, fields: Record<string, unknown>) => {
    await fetch(`/api/sdr/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    onLeadUpdated();
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto bg-slate-50 p-6">
      {FUNNEL_COLUMNS.map((column) => {
        const columnLeads = leads.filter((l) => funnelColumn(l.stage) === column.stage);
        const total = columnLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);

        return (
          <div
            key={column.stage}
            className={`flex min-w-[290px] flex-1 flex-col rounded-2xl border bg-slate-100/70 transition ${
              dragOver === column.stage ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-slate-200"
            }`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver(column.stage);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              setDragOver(null);
              const leadId = e.dataTransfer.getData("text/lead-id");
              if (leadId) patchLead(leadId, { stage: column.stage });
            }}
          >
            <div className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_COLORS[column.stage]}`} />
                  {column.label}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {columnLeads.length}
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
                        <span className="truncate font-semibold text-slate-800">{name}</span>
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

                    {lead.interest && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{lead.interest}</p>}

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
    </div>
  );
}
