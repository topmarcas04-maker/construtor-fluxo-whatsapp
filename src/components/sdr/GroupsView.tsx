"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Settings2, Users, X } from "lucide-react";
import type { Message, QuickReply } from "@/lib/types/sdr";
import { timeLabel } from "@/lib/types/sdr";
import { Modal, Button, Toggle } from "@/components/ui";
import { Composer, type OutgoingPayload } from "./Composer";
import { MessageMedia, mediaCaption } from "./MessageMedia";
import { waFormat } from "./ConversationsView";

interface Group {
  id: string;
  jid: string;
  name: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { body: string; direction: string; authorName: string | null; sender: string | null } | null;
}

interface AvailableGroup {
  jid: string;
  name: string;
  size: number | null;
  enabled: boolean;
}

/** Cor fixa por pessoa (como no WhatsApp) */
const AUTHOR_COLORS = ["text-emerald-700", "text-sky-700", "text-violet-700", "text-rose-700", "text-amber-700", "text-teal-700", "text-indigo-700", "text-fuchsia-700"];
function authorColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}

/** Grupos do WhatsApp: ler e responder pelo painel (sem IA, sem lead) */
export function GroupsView({ quickReplies, onMobileChat }: { quickReplies: QuickReply[]; onMobileChat?: (open: boolean) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    onMobileChat?.(mobilePane === "chat");
  }, [mobilePane, onMobileChat]);

  const loadGroups = useCallback(async () => {
    const r = await fetch("/api/sdr/groups", { cache: "no-store" });
    if (r.ok) setGroups(await r.json());
  }, []);
  useEffect(() => {
    loadGroups();
    const t = setInterval(loadGroups, 8000);
    return () => clearInterval(t);
  }, [loadGroups]);

  const loadMessages = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingMsgs(true);
    const r = await fetch(`/api/sdr/conversations/${id}/messages`, { cache: "no-store" });
    if (r.ok) setMessages(await r.json());
    setLoadingMsgs(false);
  }, []);
  useEffect(() => {
    if (!selected) return;
    lastCount.current = 0;
    loadMessages(selected);
    const t = setInterval(() => loadMessages(selected, true), 5000);
    return () => clearInterval(t);
  }, [selected, loadMessages]);

  // Rola para o fim quando chega mensagem nova
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  // Grupo aberto: marca como lido
  const current = groups?.find((g) => g.id === selected) || null;
  useEffect(() => {
    if (!current || current.unread === 0) return;
    if (typeof window !== "undefined" && window.innerWidth < 768 && mobilePane !== "chat") return;
    fetch(`/api/sdr/conversations/${current.id}/read`, { method: "POST" }).then(loadGroups).catch(() => {});
  }, [current, mobilePane, loadGroups]);

  const handleSend = async (payload: OutgoingPayload) => {
    if (!selected) return false;
    setSendError(null);
    const res = await fetch(`/api/sdr/conversations/${selected}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSendError(d.error || "Não foi possível enviar");
    }
    await loadMessages(selected, true);
    loadGroups();
    return res.ok;
  };

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]">
      {/* Lista de grupos */}
      <div className={`min-h-0 flex-col border-r border-slate-200 bg-white ${mobilePane === "list" ? "flex" : "hidden md:flex"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-500">Sem IA: só a equipe responde.</p>
          <button
            onClick={() => setManage(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Settings2 size={14} /> Escolher grupos
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups === null ? (
            <p className="p-5 text-sm text-slate-400">Carregando...</p>
          ) : groups.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <Users size={28} className="mx-auto mb-2 text-slate-300" />
              Nenhum grupo no painel ainda.
              <br />
              Adicione o número conectado no grupo pelo celular e depois clique em <b>Escolher grupos</b>.
            </div>
          ) : (
            groups.map((g) => {
              const active = g.id === selected;
              const unread = active ? 0 : g.unread;
              const m = g.lastMessage;
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelected(g.id);
                    setMobilePane("chat");
                  }}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                    active ? "bg-[var(--accent)]/8 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Users size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[15px] text-slate-900 ${unread ? "font-bold" : "font-medium"}`}>{g.name}</span>
                      <span className={`shrink-0 text-[11px] ${unread ? "font-bold text-emerald-600" : "text-slate-400"}`}>{timeLabel(g.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                        {m ? `${m.direction === "OUT" ? "Você" : m.authorName || "Alguém"}: ${m.body}` : "Sem mensagens ainda"}
                      </p>
                      {unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversa do grupo */}
      {!current ? (
        <div className="hidden items-center justify-center bg-slate-50 text-sm text-slate-400 md:flex">Escolha um grupo</div>
      ) : (
        <div className={`min-h-0 flex-col bg-slate-50 ${mobilePane === "chat" ? "flex" : "hidden md:flex"}`}>
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5 md:px-6 md:py-3">
            <button onClick={() => setMobilePane("list")} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Voltar">
              <ArrowLeft size={20} />
            </button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Users size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-slate-900">{current.name}</h3>
              <p className="text-xs text-slate-500">Grupo do WhatsApp · a IA não responde aqui</p>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 md:px-6">
            {loadingMsgs ? (
              <p className="text-sm text-slate-400">Carregando mensagens...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400">As mensagens novas do grupo aparecem aqui.</p>
            ) : (
              messages.map((msg) => {
                const out = msg.direction === "OUT";
                const author = msg.authorName || (out ? "Você" : "Participante");
                return (
                  <div key={msg.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] shadow-sm md:max-w-[70%] ${
                        out ? "rounded-br-md bg-[var(--accent)] text-white" : "rounded-bl-md bg-white text-slate-800"
                      }`}
                    >
                      <p className={`mb-0.5 text-[12px] font-semibold ${out ? "text-white/75" : authorColor(author)}`}>{author}</p>
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
            <Composer quickReplies={quickReplies} onSend={handleSend} />
          </div>
        </div>
      )}

      {manage && (
        <ManageGroups
          onClose={() => {
            setManage(false);
            loadGroups();
          }}
        />
      )}
    </div>
  );
}

/** Escolher quais grupos do número conectado aparecem no painel */
function ManageGroups({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<AvailableGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/sdr/groups?all=1", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Não foi possível carregar os grupos");
        setList(d);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const toggle = async (g: AvailableGroup) => {
    setList((l) => l && l.map((x) => (x.jid === g.jid ? { ...x, enabled: !g.enabled } : x)));
    await fetch("/api/sdr/groups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: g.jid, name: g.name, enabled: !g.enabled }),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Grupos no painel"
      footer={
        <Button onClick={onClose}>
          <X size={15} /> Fechar
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Ligue os grupos que a equipe quer ler e responder por aqui. A IA, o chatbot e o recontato não agem nos grupos e ninguém do grupo vira lead.
        As mensagens aparecem a partir de agora (as antigas não vêm).
      </p>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : list === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Buscando os grupos do WhatsApp...
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-500">O número conectado não participa de nenhum grupo. Adicione-o no grupo pelo celular e abra esta tela de novo.</p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {list.map((g) => (
            <div key={g.jid} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{g.name}</p>
                {g.size != null && <p className="text-xs text-slate-400">{g.size} participantes</p>}
              </div>
              <Toggle checked={g.enabled} onChange={() => toggle(g)} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
