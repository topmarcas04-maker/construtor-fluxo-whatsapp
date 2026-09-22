"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  sales: {
    totalSales: number;
    closedDeals: number;
    averageTicket: number;
    totalLeads: number;
  };
  flows: {
    activeFlows: number;
    activeConversations: number;
    executionsToday: number;
  };
  leadsByStage: Array<{
    stage: string;
    count: number;
  }>;
  recentDeals: Array<{
    id: string;
    cardName: string;
    dealValue: number;
    closedAt: string;
  }>;
  timestamp: string;
}

export default function Home() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/dashboard/stats");
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Carregando dashboard...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Erro ao carregar dados: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-4">
          <Link
            href="/builder"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Novo Fluxo
          </Link>
          <Link
            href="/flows"
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
          >
            Fluxos
          </Link>
        </div>
      </div>

      {/* Sales Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Vendas Totais</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            R$ {stats.sales.totalSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Deals Fechados</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {stats.sales.closedDeals}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Ticket Médio</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            R$ {stats.sales.averageTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Total de Leads</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {stats.sales.totalLeads}
          </p>
        </div>
      </div>

      {/* Flow Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Fluxos Ativos</h3>
          <p className="text-3xl font-bold text-cyan-600 mt-2">
            {stats.flows.activeFlows}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Conversas Ativas</h3>
          <p className="text-3xl font-bold text-indigo-600 mt-2">
            {stats.flows.activeConversations}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-medium">Execuções Hoje</h3>
          <p className="text-3xl font-bold text-pink-600 mt-2">
            {stats.flows.executionsToday}
          </p>
        </div>
      </div>

      {/* Leads by Stage */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Leads por Estágio</h2>
        <div className="space-y-4">
          {stats.leadsByStage.map((stage) => (
            <div key={stage.stage} className="flex items-center justify-between">
              <span className="text-gray-700 capitalize">{stage.stage}</span>
              <div className="flex items-center gap-4">
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min((stage.count / stats.sales.totalLeads) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
                <span className="text-gray-900 font-semibold min-w-12 text-right">
                  {stage.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Closed Deals */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Últimas Vendas Fechadas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Lead</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Valor</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.recentDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{deal.cardName || "Sem nome"}</td>
                  <td className="px-4 py-3 font-semibold text-green-600">
                    R$ {deal.dealValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {deal.closedAt ? new Date(deal.closedAt).toLocaleDateString("pt-BR") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Last update */}
      <div className="text-center text-gray-500 text-sm">
        Última atualização: {new Date(stats.timestamp).toLocaleTimeString("pt-BR")}
      </div>
    </div>
  );
}
