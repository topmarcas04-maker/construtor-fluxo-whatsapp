"use client";

import { useEffect, useState } from "react";
/* eslint-disable @next/next/no-img-element -- QR code é gerado dinamicamente como data URL */

interface Status {
  connected: boolean;
  phone: string | null;
  qrDataUrl: string | null;
  error?: string;
}

export default function WhatsappStatusPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/sdr/whatsapp/status");
        const data = await res.json();
        setStatus(data);
      } catch {
        setStatus({ connected: false, phone: null, qrDataUrl: null, error: "Falha ao consultar status" });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      {!status ? (
        <p className="text-gray-500">Consultando status da conexão...</p>
      ) : status.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="font-medium text-amber-800">Motor de fluxo indisponível</p>
          <p className="mt-1 text-sm text-amber-700">{status.error}</p>
          <p className="mt-3 text-xs text-amber-600">
            Confira se o serviço do motor (Baileys) está rodando no Railway e se a
            variável <code>FLOW_ENGINE_URL</code> do app web aponta pra ele.
          </p>
        </div>
      ) : status.connected ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-lg font-semibold text-emerald-800">
            WhatsApp conectado
          </p>
          <p className="mt-1 text-sm text-emerald-700">Número: {status.phone}</p>
        </div>
      ) : status.qrDataUrl ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <p className="mb-4 font-medium text-gray-800">Escaneie com o WhatsApp</p>
          <img
            src={status.qrDataUrl}
            alt="QR Code de conexão do WhatsApp"
            className="mx-auto h-64 w-64"
          />
          <p className="mt-4 text-sm text-gray-500">
            No celular: Configurações → Aparelhos conectados → Conectar aparelho
          </p>
        </div>
      ) : (
        <p className="text-gray-500">Aguardando QR Code...</p>
      )}
    </div>
  );
}
