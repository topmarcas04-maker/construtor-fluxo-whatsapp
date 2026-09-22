"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Flow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  phoneNumber: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFlows = async () => {
      try {
        const response = await fetch("/api/flows");
        if (!response.ok) throw new Error("Failed to fetch flows");
        const data = await response.json();
        setFlows(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, []);

  if (loading) {
    return <p className="text-gray-600">Carregando fluxos...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Fluxos</h1>
        <Link
          href="/builder"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Novo Fluxo
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {flows.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">Nenhum fluxo criado ainda</p>
          <Link
            href="/builder"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
          >
            Criar Primeiro Fluxo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{flow.name}</h3>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      flow.enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {flow.enabled ? "Ativo" : "Inativo"}
                  </span>
                </div>
                {flow.description && (
                  <p className="text-gray-600 text-sm mb-4">{flow.description}</p>
                )}
                <div className="mb-4 text-sm text-gray-500">
                  <p>📱 {flow.phoneNumber}</p>
                  <p>⚡ Prioridade: {flow.priority}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/builder/${flow.id}`}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 text-center"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Tem certeza?")) {
                        fetch(`/api/flows/${flow.id}`, { method: "DELETE" }).then(() => {
                          setFlows(flows.filter((f) => f.id !== flow.id));
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                  >
                    Deletar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
