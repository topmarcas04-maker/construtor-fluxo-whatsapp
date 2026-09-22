"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, KanbanSquare, Search } from "lucide-react";
import type { Lead, QuickReply, Seller, Tag } from "@/lib/types/sdr";
import { leadDisplayName } from "@/lib/types/sdr";
import { ExpandButton } from "@/components/layout/Fullscreen";
import { ConversationsView } from "@/components/sdr/ConversationsView";
import { FunnelView } from "@/components/sdr/FunnelView";

type ViewMode = "conversas" | "funil";

export function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("conversas");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/sdr/leads", { cache: "no-store" });
      if (!res.ok) return;
      const data: Lead[] = await res.json();
      setLeads(data);
      setSelectedLeadId((current) => current || data[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCanEdit(Boolean(u?.canEditLeads)));
    Promise.all([
      fetch("/api/sdr/tags").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sdr/sellers").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sdr/quick-replies").then((r) => (r.ok ? r.json() : [])),
    ]).then(([t, s, q]) => {
      setTags(t);
      setSellers(s);
      setQuickReplies(q);
    });
    const interval = setInterval(loadLeads, 8000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [leadDisplayName(l), l.phone, l.city, l.interest, l.seller?.name, l.conversation.phoneJid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [leads, search]);

  const counts = useMemo(
    () => ({
      total: leads.length,
      ai: leads.filter((l) => !l.aiPaused && !l.seller).length,
      hot: leads.filter((l) => l.stage === "HOT_LEAD").length,
    }),
    [leads]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="mr-2 text-xl font-semibold text-slate-900">Leads</h1>

        <div className="flex rounded-lg bg-slate-100 p-1">
          {(
            [
              { key: "conversas", label: "Conversas", icon: MessageSquare },
              { key: "funil", label: "Funil", icon: KanbanSquare },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-4 text-sm text-slate-500 md:flex">
          <span>
            <b className="text-slate-800">{counts.total}</b> leads
          </span>
          <span>
            <b className="text-violet-600">{counts.ai}</b> com a IA
          </span>
          <span>
            <b className="text-orange-600">{counts.hot}</b> quentes
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone, cidade..."
              className="w-64 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:bg-white"
            />
          </div>
          <ExpandButton />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === "conversas" ? (
          <ConversationsView
            leads={filtered}
            tags={tags}
            sellers={sellers}
            quickReplies={quickReplies}
            loading={loading}
            onLeadUpdated={loadLeads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
            canEdit={canEdit}
          />
        ) : (
          <FunnelView
            leads={filtered}
            sellers={sellers}
            onLeadUpdated={loadLeads}
            canEdit={canEdit}
            onOpenConversation={(leadId) => {
              setSelectedLeadId(leadId);
              setView("conversas");
            }}
          />
        )}
      </div>
    </div>
  );
}
