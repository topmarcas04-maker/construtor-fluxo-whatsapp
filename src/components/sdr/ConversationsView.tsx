"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, UserRound, Sparkles, PauseCircle, PlayCircle, MapPin, Bell, ArrowLeft, IdCard, X, Workflow, CalendarClock, KanbanSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Lead, Message, QuickReply, Seller, Tag } from "@/lib/types/sdr";
import {
  TAG_DOT_CLASSES,
  funnelColumn,
  leadDisplayName,
  timeLabel,
  contactLine,
  CHANNEL_LABEL,
  CHANNEL_BADGE,
} from "@/lib/types/sdr";
import { LeadPanel } from "./LeadPanel";
import { columnOfLead, funnelOfLead, type FunnelWithColumns } from "@/lib/funnel/common";
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
  funnels: FunnelWithColumns[];
  /** Celular: conversa aberta (a tela de Leads esconde o cabeçalho para sobrar espaço) */
  onMobileChat?: (open: boolean) => void;
}

type Filter = "todos" | "naolidas" | "aguardando" | "ia" | "vendedor" | "quentes";

/** Quem mandou a última mensagem (prévia da lista) */
function previewPrefix(m: { direction: string; sender?: string | null }) {
  if (m.direction === "IN") return "";
  switch (m.sender) {
    case "AI":
      return "IA: ";
    case "BOT":
      return "Chatbot: ";
    case "FOLLOWUP":
      return "Recontato: ";
    case "AUTO":
      return "Lembrete: ";
    default:
      return "Você: ";
  }
}

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
  if (lead.inBot) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
        <Workflow size={11} /> No chatbot
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
  funnels,
  onMobileChat,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [channelFilter, setChannelFilter] = useState<string>("todos");
  const [funnelFilter, setFunnelFilter] = useState<string>("todos");
  const channels = useMemo(
    () => [...new Set(leads.map((l) => l.conversation.channel || "WHATSAPP"))],
    [leads]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const visible = useMemo(() => {
    const byFunnel = funnelFilter === "todos" ? leads : leads.filter((l) => funnelOfLead(l, funnels)?.id === funnelFilter);
    const byChannel =
      channelFilter === "todos" ? byFunnel : byFunnel.filter((l) => (l.conversation.channel || "WHATSAPP") === channelFilter);
    switch (filter) {
      case "naolidas":
        return byChannel.filter((l) => (l.unread || 0) > 0);
      case "aguardando":
        return byChannel.filter((l) => l.lastMessage?.direction === "IN");
      case "ia":
        return byChannel.filter((l) => !l.aiPaused && !l.seller);
      case "vendedor":
        return byChannel.filter((l) => l.seller);
      case "quentes":
        return byChannel.filter((l) => funnelColumn(l.stage) === "HOT_LEAD");
      default:
        return byChannel;
    }
  }, [leads, filter, channelFilter, funnelFilter, funnels]);

  // Celular/tablet: uma tela por vez (lista → conversa) e a ficha abre por cima
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [showFicha, setShowFicha] = useState(false);
  /** Computador: ficha fixa à direita (pode recolher para a conversa ficar maior) */
  const [fichaDocked, setFichaDocked] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("sdr_ficha_docked") === "0") setFichaDocked(false);
    } catch {}
  }, []);
  const openedByUser = useRef<string | null>(null);
  // Abriu a conversa (na tela): marca como lida
  const selectedUnread = leads.find((l) => l.id === selectedLeadId)?.unread || 0;
  const selectedConv = leads.find((l) => l.id === selectedLeadId)?.conversationId;
  useEffect(() => {
    // Só quando a pessoa abriu a conversa (a primeira da lista abre sozinha e não conta como lida)
    if (!selectedConv || selectedUnread === 0 || openedByUser.current !== selectedConv) return;
    const visibleNow =
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      (window.innerWidth >= 768 || mobilePane === "chat");
    if (!visibleNow) return;
    fetch(`/api/sdr/conversations/${selectedConv}/read`, { method: "POST" })
      .then(() => onLeadUpdated())
      .catch(() => {});
  }, [selectedConv, selectedUnread, mobilePane, onLeadUpdated]);

  const toggleDocked = () =>
    setFichaDocked((v) => {
      try {
        localStorage.setItem("sdr_ficha_docked", v ? "0" : "1");
      } catch {}
      return !v;
    });
  useEffect(() => {
    onMobileChat?.(mobilePane === "chat");
  }, [mobilePane, onMobileChat]);

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

  /** Coluna do funil do card (cabeçalho no computador, menu "+" no celular) */
  const columnSelect = (className: string) => {
    if (!selectedLead) return null;
                const lf = funnelOfLead(selectedLead, funnels);
                const current = lf ? columnOfLead(selectedLead, lf.columns) : undefined;
                return (
                  <select
                    value={current?.id || ""}
                    disabled={!canEdit || !lf}
                    title={canEdit ? "Funil e coluna do card" : "Sem permissão para editar o card"}
                    onChange={(e) => patchLead({ columnId: e.target.value })}
                    className={className}
                  >
                    {funnels.length > 1
                      ? funnels.map((f) => (
                          <optgroup key={f.id} label={f.name}>
                            {f.columns.map((c) => (
                              <option key={c.id} value={c.id}>
                                {f.id === lf?.id ? c.name : `${f.name} → ${c.name}`}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : (lf?.columns || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                  </select>
                );
  };

  const unreadCount = leads.filter((l) => (l.unread || 0) > 0).length;
  const waitingCount = leads.filter((l) => l.lastMessage?.direction === "IN").length;
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "naolidas", label: unreadCount ? `Não lidas (${unreadCount})` : "Não lidas" },
    { key: "aguardando", label: waitingCount ? `Sem resposta (${waitingCount})` : "Sem resposta" },
    { key: "ia", label: "IA" },
    { key: "vendedor", label: "Com vendedor" },
    { key: "quentes", label: "Quentes" },
  ];

  return (
    <div
      className={`grid h-full grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] ${
        fichaDocked && selectedLead ? "xl:grid-cols-[340px_minmax(0,1fr)_330px]" : ""
      }`}
    >
      {/* Lista de conversas */}
      <div className={`min-h-0 flex-col border-r border-slate-200 bg-white ${mobilePane === "list" ? "flex" : "hidden md:flex"}`}>
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === f.key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {funnels.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2">
            {[{ id: "todos", name: "Todos os funis" }, ...funnels].map((f) => (
              <button
                key={f.id}
                onClick={() => setFunnelFilter(f.id)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  funnelFilter === f.id ? "border-violet-500 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
        {channels.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2">
            {["todos", ...channels].map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  channelFilter === c
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {c === "todos" ? "Todos os canais" : CHANNEL_LABEL[c] || c}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-5 text-sm text-slate-400">Carregando...</p>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">
              {leads.length === 0
                ? "Nenhuma conversa ainda. Assim que alguém escrever no WhatsApp (ou Instagram/Facebook, se conectados), o lead aparece aqui."
                : "Nenhum lead neste filtro."}
            </p>
          ) : (
            visible.map((lead) => {
              const name = leadDisplayName(lead);
              const active = selectedLeadId === lead.id;
              const unanswered = lead.lastMessage?.direction === "IN";
              const unread = active && openedByUser.current === lead.conversationId ? 0 : lead.unread || 0;
              return (
                <button
                  key={lead.id}
                  onClick={() => {
                    openedByUser.current = lead.conversationId;
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
                      <span className={`truncate text-[15px] ${unread ? "font-bold" : "font-medium"} text-slate-900`}>
                        {name}
                      </span>
                      <span className={`shrink-0 text-[11px] ${unread ? "font-bold text-emerald-600" : "text-slate-400"}`}>
                        {timeLabel(lead.conversation.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                        {lead.lastMessage ? `${previewPrefix(lead.lastMessage)}${lead.lastMessage.body}` : "Sem mensagens"}
                      </p>
                      {unread > 0 && (
                        <span
                          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white"
                          title={`${unread} mensagem(ns) não lida(s)`}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {lead.conversation.channel && lead.conversation.channel !== "WHATSAPP" && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHANNEL_BADGE[lead.conversation.channel] || ""}`}>
                          {CHANNEL_LABEL[lead.conversation.channel] || lead.conversation.channel}
                        </span>
                      )}
                      {unanswered && !unread && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700" title="A última mensagem é do cliente e ninguém respondeu ainda">
                          Sem resposta
                        </span>
                      )}
                      <StatusChip lead={lead} />
                      {lead.lastAction && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="Última ação (IA ou chatbot)">
                          ⚡ {lead.lastAction}
                        </span>
                      )}
                      {lead.product && (
                        <span className="max-w-[140px] truncate rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]" title="Produto de interesse">
                          {lead.product.name}
                        </span>
                      )}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-1.5 md:gap-3 md:px-6 md:py-3">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <button
                onClick={() => setMobilePane("list")}
                className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Voltar para a lista"
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar name={leadDisplayName(selectedLead)} />
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">{leadDisplayName(selectedLead)}</h3>
                <p className="text-xs text-slate-500">
                  {contactLine(selectedLead)}
                </p>
              </div>
            </div>
            {/* Celular: só o status da IA; as opções ficam no botão "+" ao lado da mensagem */}
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold md:hidden ${
                selectedLead.aiPaused ? "bg-slate-100 text-slate-500" : "bg-violet-50 text-violet-700"
              }`}
            >
              {selectedLead.aiPaused ? "IA pausada" : "IA ativa"}
            </span>
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <button
                onClick={() => setShowFicha(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 xl:hidden"
              >
                <IdCard size={16} /> Ficha
              </button>
              <button
                onClick={toggleDocked}
                title={fichaDocked ? "Recolher a ficha para a conversa ficar maior" : "Mostrar a ficha do lead ao lado"}
                className={`hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium xl:inline-flex ${
                  fichaDocked ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                }`}
              >
                {fichaDocked ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} Ficha
              </button>
              {columnSelect("max-w-[200px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm")}
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
                          : msg.sender === "BOT"
                          ? "rounded-br-md bg-teal-600 text-white"
                          : msg.sender === "FOLLOWUP"
                          ? "rounded-br-md bg-indigo-600 text-white"
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
                          ) : msg.sender === "BOT" ? (
                            <>
                              <Workflow size={11} /> Chatbot
                            </>
                          ) : msg.sender === "FOLLOWUP" ? (
                            <>
                              <CalendarClock size={11} /> {msg.authorName || "Recontato"}
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
                          {msg.transcript && (
                            <p
                              className={`whitespace-pre-wrap break-words border-l-2 pl-2 text-[13px] italic ${
                                out ? "border-white/40 text-white/85" : "border-slate-300 text-slate-600"
                              }`}
                              title="Texto do áudio"
                            >
                              “{msg.transcript}”
                            </p>
                          )}
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
              <p className="mb-2 hidden text-xs text-slate-400 md:block">Se você enviar uma mensagem, a IA pausa e você assume a conversa.</p>
            )}
            <Composer
              quickReplies={quickReplies}
              onSend={handleSend}
              mobileActions={(close) => (
                <>
                  <button
                    onClick={() => {
                      close();
                      setShowFicha(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-slate-700 active:bg-slate-100"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><IdCard size={18} /></span> Ficha do lead
                  </button>
                  <label className="flex w-full items-center gap-3 px-4 py-2 text-[15px] text-slate-700">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-600"><KanbanSquare size={18} /></span>
                    {columnSelect("min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm")}
                  </label>
                  <button
                    onClick={() => {
                      close();
                      patchLead({ aiPaused: !selectedLead.aiPaused });
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-slate-700 active:bg-slate-100"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-50 text-violet-600">
                      {selectedLead.aiPaused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                    </span>
                    {selectedLead.aiPaused ? "Ativar IA" : "Pausar IA"}
                  </button>
                </>
              )}
            />
          </div>
        </div>
      )}

      {/* Ficha do lead */}
      {selectedLead && fichaDocked && (
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

