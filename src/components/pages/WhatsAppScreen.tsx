"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, AlertTriangle, Bot, RefreshCw, QrCode, LogOut, Pencil, Check, Lock } from "lucide-react";
import { Page, PageHeader, Card, Badge, Button } from "@/components/ui";
import { NumberRules, type RulesOptions } from "@/components/whatsapp/NumberRules";
import type { WaNumberConfig } from "@/lib/whatsapp/config";

interface NumberStatus {
  slot: number;
  label: string | null;
  state?: "idle" | "starting" | "qr" | "connected";
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  error?: string;
}

interface Status {
  numbers?: NumberStatus[];
  maxWhatsapp?: number;
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

/** Um WhatsApp da conta: conectado, QR Code ou botão para gerar */
function NumberCard({
  n,
  multi,
  busy,
  onConnect,
  onDisconnect,
  onRename,
  rules,
}: {
  n: NumberStatus;
  multi: boolean;
  rules?: { initial: WaNumberConfig; options: RulesOptions } | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRename: (label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(n.label || "");
  const title = n.label || `WhatsApp ${n.slot}`;

  return (
    <Card className={multi ? "p-6" : "p-8"}>
      {multi && (
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {editing ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await onRename(label);
                setEditing(false);
              }}
            >
              <input
                autoFocus
                value={label}
                maxLength={60}
                placeholder={`WhatsApp ${n.slot}`}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button type="submit" className="rounded-lg bg-[var(--accent)] p-1.5 text-white" title="Salvar nome">
                <Check size={15} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">{n.slot}</span>
              <p className="font-semibold text-slate-900">{title}</p>
              <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-slate-400 hover:text-slate-700" title="Dar um nome (ex.: Vendas, Pós-venda)">
                <Pencil size={13} />
              </button>
            </div>
          )}
          {n.state === "connected" ? <Badge tone="green">Online</Badge> : <Badge tone="amber">Desconectado</Badge>}
        </div>
      )}

      {n.error ? (
        <div className="flex gap-4">
          <AlertTriangle className="shrink-0 text-amber-500" size={28} />
          <div>
            <p className="text-lg font-semibold text-slate-900">Motor do WhatsApp indisponível</p>
            <p className="mt-1 text-sm text-slate-600">{n.error}</p>
            <p className="mt-3 text-sm text-slate-500">
              Confira no Railway se o serviço do motor está <b>Online</b> e se a variável{" "}
              <code className="rounded bg-slate-100 px-1">FLOW_ENGINE_URL</code> do site aponta para ele.
            </p>
          </div>
        </div>
      ) : n.state === "connected" ? (
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={30} />
            </span>
            <div>
              {!multi && (
                <div className="flex items-center gap-2">
                  <p className="text-xl font-semibold text-slate-900">WhatsApp conectado</p>
                  <Badge tone="green">Online</Badge>
                </div>
              )}
              <p className={multi ? "text-lg font-semibold text-slate-900" : "mt-1 text-slate-600"}>{formatPhone(n.phone)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {multi
                  ? "Conversas que chegam por este número são respondidas por ele."
                  : "Tudo certo. Novas conversas aparecem em Leads. A conexão continua mesmo após atualizações do sistema."}
              </p>
            </div>
          </div>
          <Button variant="danger" onClick={onDisconnect} disabled={busy}>
            <LogOut size={15} /> Desconectar
          </Button>
        </div>
      ) : n.state === "qr" && n.qrDataUrl ? (
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={n.qrDataUrl} alt="QR Code do WhatsApp" className="h-64 w-64 rounded-xl border border-slate-200 p-2" />
          <div className="space-y-3">
            <p className="text-xl font-semibold text-slate-900">Escaneie o QR Code</p>
            <ol className="space-y-2 text-[15px] text-slate-600">
              <li>1. Abra o WhatsApp no celular {multi ? "deste número" : "desta empresa"}</li>
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
      ) : n.state === "starting" ? (
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin" size={20} /> Preparando a conexão...
        </div>
      ) : (
        <div className={`flex flex-col items-center text-center ${multi ? "py-2" : "py-6"}`}>
          {!multi && (
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <QrCode size={32} />
            </span>
          )}
          <p className={multi ? "font-semibold text-slate-900" : "text-xl font-semibold text-slate-900"}>WhatsApp não conectado</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Clique no botão para gerar o QR Code e leia com o celular {multi ? "deste número" : "da empresa"}. Se o código expirar, é só gerar de novo.
          </p>
          <Button onClick={onConnect} disabled={busy} className="mt-4 px-6 py-2.5">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <QrCode size={16} />} Gerar QR Code
          </Button>
        </div>
      )}
      {multi && rules && <NumberRules slot={n.slot} initial={rules.initial} options={rules.options} />}
    </Card>
  );
}

export function WhatsAppScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rulesData, setRulesData] = useState<(RulesOptions & { configs: Record<number, WaNumberConfig> }) | null>(null);

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
    fetch("/api/sdr/whatsapp/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRulesData(d))
      .catch(() => {});
  }, [load]);

  const numbers: NumberStatus[] = status?.numbers?.length
    ? status.numbers
    : status
      ? [{ slot: 1, label: null, state: status.state, connected: status.connected, phone: status.phone, qrDataUrl: status.qrDataUrl, error: status.error }]
      : [];
  const multi = numbers.length > 1;
  const max = status?.maxWhatsapp || 1;
  const connectedCount = numbers.filter((n) => n.state === "connected").length;

  // Atualiza mais rápido enquanto espera a leitura do QR
  const waiting = numbers.some((n) => n.state === "qr" || n.state === "starting");
  useEffect(() => {
    const t = setInterval(load, waiting ? 3000 : 10000);
    return () => clearInterval(t);
  }, [load, waiting]);

  const act = async (slot: number, path: "connect" | "logout") => {
    if (path === "logout" && !confirm(`Desconectar ${multi ? `o WhatsApp ${slot}` : "este WhatsApp"}? As conversas dele param de ser atendidas até conectar de novo.`)) return;
    setBusy(slot);
    setActionError(null);
    const res = await fetch(`/api/sdr/whatsapp/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(data.error || (path === "connect" ? "Não foi possível iniciar" : "Não foi possível desconectar"));
    await load();
    setBusy(null);
  };

  const rename = async (slot: number, label: string) => {
    await fetch("/api/sdr/whatsapp/label", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, label }),
    });
    await load();
  };

  return (
    <Page>
      <PageHeader
        title="WhatsApp"
        description={
          multi
            ? `Sua conta pode conectar até ${max} números. As mensagens recebidas em qualquer um viram leads, e a resposta sai pelo mesmo número.`
            : "Conecte o número desta conta. As mensagens recebidas viram leads automaticamente."
        }
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={15} /> Atualizar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {!status ? (
            <Card className="p-8">
              <div className="flex items-center gap-3 text-slate-500">
                <Loader2 className="animate-spin" size={20} /> Consultando conexão...
              </div>
            </Card>
          ) : (
            numbers.map((n) => (
              <NumberCard
                key={n.slot}
                n={n}
                multi={multi}
                busy={busy === n.slot}
                onConnect={() => act(n.slot, "connect")}
                onDisconnect={() => act(n.slot, "logout")}
                onRename={(label) => rename(n.slot, label)}
                rules={rulesData ? { initial: rulesData.configs[n.slot], options: rulesData } : null}
              />
            ))
          )}
          {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
          {status && max < 3 && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Lock size={13} /> Seu plano permite {max} número{max > 1 ? "s" : ""} de WhatsApp. Para liberar mais, fale com quem administra a sua conta.
            </p>
          )}
        </div>

        <Card className="h-fit p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Bot size={22} />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Agentes de IA</p>
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
              <span className="text-slate-600">{multi ? "WhatsApps conectados" : "WhatsApp"}</span>
              {multi ? (
                <Badge tone={connectedCount ? "green" : "amber"}>
                  {connectedCount} de {numbers.length}
                </Badge>
              ) : numbers[0]?.state === "connected" ? (
                <Badge tone="green">Conectado</Badge>
              ) : (
                <Badge tone="amber">Desconectado</Badge>
              )}
            </li>
          </ul>
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <Smartphone size={14} className="mt-0.5 shrink-0" />
            Liga/desliga, chave da IA e o jeito de falar ficam em Configurações → Agentes de IA.
          </p>
        </Card>
      </div>
    </Page>
  );
}
