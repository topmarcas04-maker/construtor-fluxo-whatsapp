"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, AlertTriangle, Bot, RefreshCw } from "lucide-react";
import { Page, PageHeader, Card, Badge, Button } from "@/components/ui";

interface Status {
  connected: boolean;
  phone: string | null;
  qrDataUrl: string | null;
  aiReady?: boolean;
  error?: string;
}

function formatPhone(phone: string | null) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

export function WhatsAppScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sdr/whatsapp/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch {
      setStatus({ connected: false, phone: null, qrDataUrl: null, error: "Falha ao consultar status" });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    fetch("/api/sdr/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setAiEnabled(Boolean(s.enabled)))
      .catch(() => {});
    return () => clearInterval(t);
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="WhatsApp"
        description="Conecte o número da loja. As mensagens recebidas viram leads automaticamente."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={15} /> Atualizar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-8">
          {!status ? (
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={20} /> Consultando conexão...
            </div>
          ) : status.error ? (
            <div className="flex gap-4">
              <AlertTriangle className="shrink-0 text-amber-500" size={28} />
              <div>
                <p className="text-lg font-semibold text-slate-900">Motor do WhatsApp indisponível</p>
                <p className="mt-1 text-sm text-slate-600">{status.error}</p>
                <p className="mt-3 text-sm text-slate-500">
                  Confira no Railway se o serviço do motor está <b>Online</b> e se a variável{" "}
                  <code className="rounded bg-slate-100 px-1">FLOW_ENGINE_URL</code> do site aponta para ele.
                </p>
              </div>
            </div>
          ) : status.connected ? (
            <div className="flex items-center gap-5">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={34} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-semibold text-slate-900">WhatsApp conectado</p>
                  <Badge tone="green">Online</Badge>
                </div>
                <p className="mt-1 text-slate-600">{formatPhone(status.phone)}</p>
                <p className="mt-2 text-sm text-slate-500">
                  Tudo certo. Novas conversas aparecem em <b>Leads</b>.
                </p>
              </div>
            </div>
          ) : status.qrDataUrl ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={status.qrDataUrl}
                alt="QR Code do WhatsApp"
                className="h-64 w-64 rounded-xl border border-slate-200 p-2"
              />
              <div className="space-y-3">
                <p className="text-xl font-semibold text-slate-900">Escaneie o QR Code</p>
                <ol className="space-y-2 text-[15px] text-slate-600">
                  <li>1. Abra o WhatsApp no celular da loja</li>
                  <li>2. Toque em <b>Configurações</b> → <b>Aparelhos conectados</b></li>
                  <li>3. Toque em <b>Conectar aparelho</b></li>
                  <li>4. Aponte a câmera para este código</li>
                </ol>
                <p className="text-xs text-slate-400">O código muda sozinho a cada poucos segundos.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={20} /> Gerando QR Code...
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Bot size={22} />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Atendente com IA</p>
              <p className="text-sm text-slate-500">Responde e qualifica os leads sozinha</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Atendimento automático</span>
              {aiEnabled === null ? (
                <Badge>—</Badge>
              ) : aiEnabled ? (
                <Badge tone="green">Ligado</Badge>
              ) : (
                <Badge tone="gray">Desligado</Badge>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Chave da IA no motor</span>
              {status?.aiReady ? <Badge tone="green">Configurada</Badge> : <Badge tone="amber">Falta configurar</Badge>}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">WhatsApp</span>
              {status?.connected ? <Badge tone="green">Conectado</Badge> : <Badge tone="amber">Desconectado</Badge>}
            </li>
          </ul>
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <Smartphone size={14} className="mt-0.5 shrink-0" />
            Liga/desliga e o jeito de falar da IA ficam em Configurações → Atendimento IA.
          </p>
        </Card>
      </div>
    </Page>
  );
}
