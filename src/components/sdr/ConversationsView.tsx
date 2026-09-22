"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Lead, Message, Seller, Tag } from "@/lib/types/sdr";
import { TAG_COLOR_CLASSES, TAG_DOT_CLASSES } from "@/lib/types/sdr";

interface Props {
  leads: Lead[];
  tags: Tag[];
  sellers: Seller[];
  loading: boolean;
  onLeadUpdated: () => void;
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
}

function displayName(lead: Lead) {
  return lead.conversation.leadName || lead.cardName || lead.conversation.phoneJid.split("@")[0];
}

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR");
}

export function ConversationsView({
  leads,
  tags,
  sellers,
  loading,
  onLeadUpdated,
  selectedLeadId,
  onSelectLead,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  useEffect(() => {
    if (!selectedLead) return;
    let cancelled = false;
    setMessagesLoading(true);
    fetch(`/api/sdr/conversations/${selectedLead.conversationId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .finally(() => !cancelled && setMessagesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedLead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async () => {
    if (!selectedLead || !draft.trim()) return;
    setSending(true);
    const text = draft;
    setDraft("");
    try {
      await fetch(`/api/sdr/conversations/${selectedLead.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const res = await fetch(`/api/sdr/conversations/${selectedLead.conversationId}/messages`);
      setMessages(await res.json());
    } finally {
      setSending(false);
    }
  };

  const patchLead = async (fields: Record<string, unknown>) => {
    if (!selectedLead) return;
    await fetch(`/api/sdr/leads/${selectedLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    onLeadUpdated();
  };

  const leadTagIds = new Set(selectedLead?.tags.map((t) => t.id));

  return (
    <div className="grid h-full grid-cols-[320px_1fr]">
      {/* Lista de conversas */}
      <div className="flex flex-col border-r border-gray-200">
        <div className="border-b border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700">Conversas</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-gray-400">Carregando...</p>
          ) : leads.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">
              Nenhuma conversa ainda. Assim que alguém escrever no WhatsApp, o lead
              aparece aqui.
            </p>
          ) : (
            leads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead.id)}
                className={`flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left transition-colors ${
                  selectedLeadId === lead.id ? "bg-[color:var(--accent)]/10" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-800">
                    {displayName(lead)}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {timeLabel(lead.conversation.lastMessageAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-gray-500">
                  {lead.lastMessage
                    ? lead.lastMessage.messageType === "text"
                      ? lead.lastMessage.body
                      : "[imagem]"
                    : "Sem mensagens"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {lead.city && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {lead.city}
                    </span>
                  )}
                  {lead.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className={`h-1.5 w-1.5 rounded-full ${TAG_DOT_CLASSES[tag.color] || "bg-gray-400"}`}
                    />
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Painel da conversa */}
      {!selectedLead ? (
        <div className="flex items-center justify-center text-sm text-gray-400">
          Selecione uma conversa à esquerda
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-3">
            <div>
              <h3 className="font-semibold text-gray-800">{displayName(selectedLead)}</h3>
              <p className="text-xs text-gray-400">{selectedLead.conversation.phoneJid.split("@")[0]}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedLead.stage}
                onChange={(e) => patchLead({ stage: e.target.value })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs"
              >
                <option value="FIRST_CONTACT">Primeiro contato</option>
                <option value="SECOND_CONTACT">Segundo contato</option>
                <option value="HOT_LEAD">Lead quente</option>
                <option value="SALE">Vendas</option>
              </select>
              <select
                value={selectedLead.seller?.id || ""}
                onChange={(e) => patchLead({ sellerId: e.target.value || null })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs"
              >
                <option value="">Sem vendedor</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-6 py-2">
              {tags.map((tag) => {
                const active = leadTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => patchLead(active ? { removeTagId: tag.id } : { addTagId: tag.id })}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-opacity ${
                      TAG_COLOR_CLASSES[tag.color] || TAG_COLOR_CLASSES.gray
                    } ${active ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-gray-50 px-6 py-4">
            {messagesLoading ? (
              <p className="text-sm text-gray-400">Carregando mensagens...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-400">Sem mensagens ainda.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "OUT" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      msg.direction === "OUT"
                        ? "bg-[color:var(--accent)] text-white"
                        : "bg-white text-gray-800"
                    }`}
                  >
                    {msg.mediaDataUrl ? (
                      <p className="italic opacity-80">[imagem]</p>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${
                        msg.direction === "OUT" ? "text-white/70" : "text-gray-400"
                      }`}
                    >
                      {timeLabel(msg.sentAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Mensagem"
              className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-[color:var(--accent)] focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-white disabled:opacity-40"
              aria-label="Enviar"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
