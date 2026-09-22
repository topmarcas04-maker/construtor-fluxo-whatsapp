"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, AlertTriangle, Bot, RefreshCw, QrCode, LogOut } from "lucide-react";
import { Page, PageHeader, Card, Badge, Button } from "@/components/ui";

interface Status {
  state?: "idle" | "starting" | "qr" | "connected";
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  aiReady?: boolean;
  aiReason?: string;
  error?: string;
}

function formatPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

export function WhatsAppScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sdr/whatsapp/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch {
      setStatus({ error: "Falha ao consultar status" });
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/sdr/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setAiEnabled(Boolean(s.enabled)))
      .catch(() => {});
  }, [load]);

  // Atualiza mais rápido enquanto espera a leitura do QR
  useEffect(() => {
    const fast = status?.state === "qr" || status?.state === "starting";
    const t = setInterval(load, fast ? 3000 : 10000);
    return () => clearInterval(t);
  }, [load, status?.state]);

  const connect = async () => {
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/sdr/whatsapp/connect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(data.error || "Não foi possível iniciar");
    await load();
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm("Desconectar este WhatsApp? A IA para de atender até conectar de novo.")) return;
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/sdr/whatsapp/logout", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(data.error || "Não foi possível desconectar");
    await load();
    setBusy(false);
  };

  return (
    <Page>
      <PageHeader
        title="WhatsApp"
        description="Conecte o número desta conta. As mensagens recebidas viram leads automaticamente."
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
          ) : status.state === "connected" ? (
            <div className="flex flex-wrap items-center justify-between gap-5">
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
                    Tudo certo. Novas conversas aparecem em <b>Leads</b>. A conexão continua mesmo após atualizações do sistema.
                  </p>
                </div>
              </div>
              <Button variant="danger" onClick={disconnect} disabled={busy}>
                <LogOut size={15} /> Desconectar
              </Button>
            </div>
          ) : status.state === "qr" && status.qrDataUrl ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={status.qrDataUrl} alt="QR Code do WhatsApp" className="h-64 w-64 rounded-xl border border-slate-200 p-2" />
              <div className="space-y-3">
                <p className="text-xl font-semibold text-slate-900">Escaneie o QR Code</p>
                <ol className="space-y-2 text-[15px] text-slate-600">
                  <li>1. Abra o WhatsApp no celular desta empresa</li>
                  <li>
                    2. Toque em <b>Configurações</b> → <b>Aparelhos conectados</b>
                  </li>
                  <li>
                    3. Toque em <b>Conectar aparelho</b>
                  </li>
                  <li>4. Aponte a câmera para este código</li>
                </ol>
                <p className="text-xs text-slate-400">O código muda sozinho a cada poucos segundos.</p>
              </div>
            </div>
          ) : status.state === "starting" ? (
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={20} /> Preparando a conexão...
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <QrCode size={32} />
              </span>
              <p className="text-xl font-semibold text-slate-900">WhatsApp não conectado</p>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Clique no botão para gerar o QR Code e leia com o celular da empresa. Se o código expirar, é só gerar de novo.
              </p>
              <Button onClick={connect} disabled={busy} className="mt-5 px-6 py-2.5">
                {busy ? <Loader2 className="animate-spin" size={16} /> : <QrCode size={16} />} Gerar QR Code
              </Button>
            </div>
          )}
          {actionError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Bot size={22} />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Atendente com IA</p>
              <p className="text-sm text-slate-500">Responde, qualifica e agenda sozinha</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Atendimento automático</span>
              {aiEnabled === null ? <Badge>—</Badge> : aiEnabled ? <Badge tone="green">Ligado</Badge> : <Badge tone="gray">Desligado</Badge>}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Integração de IA</span>
              {status?.aiReady ? (
                <Badge tone="green">Pronta</Badge>
              ) : status?.aiReason === "NONE" ? (
                <Badge>Não liberada</Badge>
              ) : (
                <Badge tone="amber">Falta a chave</Badge>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">WhatsApp</span>
              {status?.state === "connected" ? <Badge tone="green">Conectado</Badge> : <Badge tone="amber">Desconectado</Badge>}
            </li>
          </ul>
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <Smartphone size={14} className="mt-0.5 shrink-0" />
            Liga/desliga, chave da IA e o jeito de falar ficam em Configurações → Atendimento IA.
          </p>
        </Card>
      </div>
    </Page>
  );
}
