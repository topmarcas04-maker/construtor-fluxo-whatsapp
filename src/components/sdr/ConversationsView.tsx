"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, UserRound, Sparkles, PauseCircle, PlayCircle, MapPin, Bell, ArrowLeft, IdCard, X } from "lucide-react";
import type { Lead, Message, QuickReply, Seller, Tag } from "@/lib/types/sdr";
import {
  TAG_DOT_CLASSES,
  FUNNEL_COLUMNS,
  funnelColumn,
  leadDisplayName,
  formatPhone,
  timeLabel,
} from "@/lib/types/sdr";
import { LeadPanel } from "./LeadPanel";
import { MessageMedia, mediaCaption } from "./MessageMedia";

/** Mostra o *negrito* do WhatsApp como negrito no painel */
function waFormat(text: string | null | undefined) {
  if (!text) return text;
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : part
  );
}
import { Composer, type OutgoingPayload } from "./Composer";

interface Props {
  leads: Lead[];
  tags: Tag[];
  sellers: Seller[];
  quickReplies: QuickReply[];
  loading: boolean;
  onLeadUpdated: () => void;
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
  /** Pode editar o card (estágio, vendedor, dados) */
  canEdit: boolean;
}

type Filter = "todos" | "ia" | "vendedor" | "quentes";

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusChip({ lead }: { lead: Lead }) {
  if (lead.stage === "SALE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        Venda{lead.seller ? ` · ${lead.seller.name}` : ""}
      </span>
    );
  }
  if (lead.seller) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
        <UserRound size={11} /> {lead.seller.name}
      </span>
    );
  }
  if (lead.aiPaused) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        <PauseCircle size={11} /> IA pausada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
      <Bot size={11} /> IA atendendo
    </span>
  );
}

export function ConversationsView({
  leads,
  tags,
  sellers,
  quickReplies,
  loading,
  onLeadUpdated,
  selectedLeadId,
  onSelectLead,
  canEdit,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const visible = useMemo(() => {
    switch (filter) {
      case "ia":
        return leads.filter((l) => !l.aiPaused && !l.seller);
      case "vendedor":
        return leads.filter((l) => l.seller);
      case "quentes":
        return leads.filter((l) => funnelColumn(l.stage) === "HOT_LEAD");
      default:
        return leads;
    }
  }, [leads, filter]);

  // Celular/tablet: uma tela por vez (lista → conversa) e a ficha abre por cima
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [showFicha, setShowFicha] = useState(false);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );
  const conversationId = selectedLead?.conversationId;
  const lastMessageAt = selectedLead?.conversation.lastMessageAt;

  // Carrega (e recarrega quando chega mensagem nova) o histórico
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    fetch(`/api/sdr/conversations/${conversationId}/messages`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => !cancelled && setMessages(data))
      .finally(() => !cancelled && setMessagesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, lastMessageAt]);

  useEffect(() => {
    setMessagesLoading(true);
    setMessages([]);
    setSendError(null);
    lastCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      lastCountRef.current = messages.length;
    }
  }, [messages]);

  const reloadMessages = async () => {
    if (!conversationId) return;
    const res = await fetch(`/api/sdr/conversations/${conversationId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages(await res.json());
  };

  const handleSend = async (payload: OutgoingPayload) => {
    if (!selectedLead) return false;
    setSendError(null);
    const res = await fetch(`/api/sdr/conversations/${selectedLead.conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error || "Não foi possível enviar");
    }
    await reloadMessages();
    onLeadUpdated();
    return res.ok;
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

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "ia", label: "IA" },
    { key: "vendedor", label: "Com vendedor" },
    { key: "quentes", label: "Quentes" },
  ];

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_330px]">
      {/* Lista de conversas */}
      <div className={`min-h-0 flex-col border-r border-slate-200 bg-white ${mobilePane === "list" ? "flex" : "hidden md:flex"}`}>
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === f.key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-5 text-sm text-slate-400">Carregando...</p>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">
              {leads.length === 0
                ? "Nenhuma conversa ainda. Assim que alguém escrever no WhatsApp, o lead aparece aqui."
                : "Nenhum lead neste filtro."}
            </p>
          ) : (
            visible.map((lead) => {
              const name = leadDisplayName(lead);
              const active = selectedLeadId === lead.id;
              const unanswered = lead.lastMessage?.direction === "IN";
              return (
                <button
                  key={lead.id}
                  onClick={() => {
                    onSelectLead(lead.id);
                    setMobilePane("chat");
                  }}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                    active ? "bg-[var(--accent)]/8 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[15px] ${unanswered ? "font-bold" : "font-medium"} text-slate-900`}>
                        {name}
                      </span>
                      <span className={`shrink-0 text-[11px] ${unanswered ? "font-semibold text-emerald-600" : "text-slate-400"}`}>
                        {timeLabel(lead.conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {lead.lastMessage
                        ? `${lead.lastMessage.direction === "OUT" ? "Você: " : ""}${lead.lastMessage.body}`
                        : "Sem mensagens"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusChip lead={lead} />
                      {lead.city && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                          <MapPin size={11} /> {lead.city}
                        </span>
                      )}
                      {lead.tags.map((tag) => (
                        <span
                          key={tag.id}
                          title={tag.name}
                          className={`h-2 w-2 rounded-full ${TAG_DOT_CLASSES[tag.color] || "bg-slate-400"}`}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversa */}
      {!selectedLead ? (
        <div className="hidden items-center justify-center bg-slate-50 text-sm text-slate-400 md:flex">
          Selecione uma conversa à esquerda
        </div>
      ) : (
        <div className={`min-h-0 flex-col bg-slate-50 ${mobilePane === "chat" ? "flex" : "hidden md:flex"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 md:gap-3 md:px-6 md:py-3">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <button
                onClick={() => setMobilePane("list")}
                className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Voltar para a lista"
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar name={leadDisplayName(selectedLead)} />
              <div>
                <h3 className="font-semibold text-slate-900">{leadDisplayName(selectedLead)}</h3>
                <p className="text-xs text-slate-500">
                  {selectedLead.phone ? formatPhone(selectedLead.phone) : selectedLead.conversation.phoneJid.split("@")[0]}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowFicha(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 xl:hidden"
              >
                <IdCard size={16} /> Ficha
              </button>
              <select
                value={funnelColumn(selectedLead.stage)}
                disabled={!canEdit}
                title={canEdit ? undefined : "Sem permissão para editar o card"}
                onChange={(e) => patchLead({ stage: e.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
              >
                {FUNNEL_COLUMNS.map((c) => (
                  <option key={c.stage} value={c.stage}>
                    {c.label}
                  </option>
                ))}
              </select>
              {selectedLead.aiPaused ? (
                <button
                  onClick={() => patchLead({ aiPaused: false })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
                  title="A IA volta a responder este lead"
                >
                  <PlayCircle size={16} /> Ativar IA
                </button>
              ) : (
                <button
                  onClick={() => patchLead({ aiPaused: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  title="Você assume a conversa e a IA para de responder"
                >
                  <PauseCircle size={16} /> Pausar IA
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
            {messagesLoading ? (
              <p className="text-sm text-slate-400">Carregando mensagens...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400">Sem mensagens ainda.</p>
            ) : (
              messages.map((msg) => {
                const out = msg.direction === "OUT";
                const isAi = msg.sender === "AI";
                return (
                  <div key={msg.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl md:max-w-[70%] px-4 py-2.5 text-[15px] shadow-sm ${
                        out
                          ? isAi
                            ? "rounded-br-md bg-violet-600 text-white"
                          : msg.sender === "AUTO"
                          ? "rounded-br-md bg-slate-600 text-white"
                            : "rounded-br-md bg-[var(--accent)] text-white"
                          : "rounded-bl-md bg-white text-slate-800"
                      }`}
                    >
                      {out && (
                        <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-white/75">
                          {isAi ? (
                            <>
                              <Sparkles size={11} /> IA
                            </>
                          ) : msg.sender === "AUTO" ? (
                            <>
                              <Bell size={11} /> Lembrete automático
                            </>
                          ) : (
                            <>
                              <UserRound size={11} /> {msg.authorName || "Equipe"}
                            </>
                          )}
                        </p>
                      )}
                      {msg.messageType && msg.messageType !== "text" ? (
                        <div className="space-y-1.5">
                          <MessageMedia msg={msg} out={out} />
                          {mediaCaption(msg) && <p className="whitespace-pre-wrap break-words">{waFormat(mediaCaption(msg))}</p>}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{waFormat(msg.body)}</p>
                      )}
                      <p className={`mt-1 text-right text-[10px] ${out ? "text-white/70" : "text-slate-400"}`}>
                        {new Date(msg.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-3 py-2.5 md:px-6 md:py-3">
            {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
            {!selectedLead.aiPaused && !selectedLead.seller && (
              <p className="mb-2 text-xs text-slate-400">Se você enviar uma mensagem, a IA pausa e você assume a conversa.</p>
            )}
            <Composer quickReplies={quickReplies} onSend={handleSend} />
          </div>
        </div>
      )}

      {/* Ficha do lead */}
      {selectedLead && (
        <div className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-white xl:block">
          <LeadPanel lead={selectedLead} tags={tags} sellers={sellers} onPatch={patchLead} canEdit={canEdit} />
        </div>
      )}

      {/* Ficha por cima da conversa (telas menores) */}
      {selectedLead && showFicha && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <button className="flex-1 bg-black/40" aria-label="Fechar ficha" onClick={() => setShowFicha(false)} />
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="font-semibold text-slate-900">Ficha do lead</p>
              <button onClick={() => setShowFicha(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <LeadPanel lead={selectedLead} tags={tags} sellers={sellers} onPatch={patchLead} canEdit={canEdit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

