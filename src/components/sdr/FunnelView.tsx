"use client";

import type { Lead, Seller } from "@/lib/types/sdr";
import { FUNNEL_COLUMNS, funnelColumn } from "@/lib/types/sdr";

interface Props {
  leads: Lead[];
  sellers: Seller[];
  onLeadUpdated: () => void;
  onOpenConversation: (leadId: string) => void;
}

function displayName(lead: Lead) {
  return lead.conversation.leadName || lead.cardName || lead.conversation.phoneJid.split("@")[0];
}

function currency(value: number | null) {
  return (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export function FunnelView({ leads, sellers, onLeadUpdated, onOpenConversation }: Props) {
  const patchLead = async (leadId: string, fields: Record<string, unknown>) => {
    await fetch(`/api/sdr/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    onLeadUpdated();
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-6">
      {FUNNEL_COLUMNS.map((column) => {
        const columnLeads = leads.filter((l) => funnelColumn(l.stage) === column.stage);
        const total = columnLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);

        return (
          <div
            key={column.stage}
            className="flex w-72 shrink-0 flex-col rounded-lg bg-gray-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const leadId = e.dataTransfer.getData("text/lead-id");
              if (leadId) patchLead(leadId, { stage: column.stage });
            }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold text-gray-700">{column.label}</span>
              <span className="text-xs text-gray-400">{columnLeads.length}</span>
            </div>
            <p className="px-3 pb-2 text-xs text-gray-400">
              R$ {currency(total)}
            </p>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {columnLeads.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
                  className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--accent)]/10 text-xs font-semibold text-[color:var(--accent-dark)]">
                      {displayName(lead).charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-800">
                      {displayName(lead)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {lead.conversation.phoneJid.split("@")[0]}
                  </p>
                  {lead.lastMessage && (
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {lead.lastMessage.messageType === "text" ? lead.lastMessage.body : "[imagem]"}
                    </p>
                  )}
                  <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {lead.seller ? `Com ${lead.seller.name}` : "IA respondendo"}
                  </span>

                  <div className="mt-2 flex items-center gap-1 text-xs">
                    <span className="text-gray-400">R$</span>
                    <input
                      type="number"
                      defaultValue={lead.dealValue ?? ""}
                      placeholder="0,00"
                      onBlur={(e) =>
                        patchLead(lead.id, {
                          dealValue: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full rounded border border-gray-200 px-1.5 py-1"
                    />
                  </div>

                  <select
                    value={column.stage}
                    onChange={(e) => patchLead(lead.id, { stage: e.target.value })}
                    className="mt-2 w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
                  >
                    {FUNNEL_COLUMNS.map((c) => (
                      <option key={c.stage} value={c.stage}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={lead.seller?.id || ""}
                    onChange={(e) => patchLead(lead.id, { sellerId: e.target.value || null })}
                    className="mt-2 w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
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
                    className="mt-2 w-full rounded-md border border-[color:var(--accent)] py-1 text-xs text-[color:var(--accent-dark)] hover:bg-[color:var(--accent)]/10"
                  >
                    💬 Abrir conversa
                  </button>
                </div>
              ))}
              {columnLeads.length === 0 && (
                <p className="py-6 text-center text-xs text-gray-300">Solte um contato aqui</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
