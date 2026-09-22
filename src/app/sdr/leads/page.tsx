"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, Seller, Tag } from "@/lib/types/sdr";
import { ConversationsView } from "@/components/sdr/ConversationsView";
import { FunnelView } from "@/components/sdr/FunnelView";

type ViewMode = "conversas" | "funil";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("conversas");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [leadsRes, tagsRes, sellersRes] = await Promise.all([
        fetch("/api/sdr/leads"),
        fetch("/api/sdr/tags"),
        fetch("/api/sdr/sellers"),
      ]);
      const [leadsData, tagsData, sellersData] = await Promise.all([
        leadsRes.json(),
        tagsRes.json(),
        sellersRes.json(),
      ]);
      setLeads(leadsData);
      setTags(tagsData);
      setSellers(sellersData);
      setSelectedLeadId((current) => current || leadsData[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setView("conversas")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              view === "conversas" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"
            }`}
          >
            💬 Conversas
          </button>
          <button
            onClick={() => setView("funil")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              view === "funil" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"
            }`}
          >
            📊 Funil
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === "conversas" ? (
          <ConversationsView
            leads={leads}
            tags={tags}
            sellers={sellers}
            loading={loading}
            onLeadUpdated={load}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
          />
        ) : (
          <FunnelView
            leads={leads}
            sellers={sellers}
            onLeadUpdated={load}
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
