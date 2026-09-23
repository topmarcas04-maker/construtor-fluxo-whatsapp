"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign, Globe, Link2, Loader2, MessageCircle, Plug, Unplug, AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Page, PageHeader, Card, Badge, Button, Toggle, Modal, ErrorNote } from "@/components/ui";

interface Connection {
  id: string;
  pageId: string;
  pageName: string | null;
  igUserId: string | null;
  igUsername: string | null;
  messengerEnabled: boolean;
  instagramEnabled: boolean;
  status: string;
  lastError: string | null;
  lastEventAt: string | null;
}

interface PendingPage {
  id: string;
  name: string;
  igUsername: string | null;
  hasInstagram: boolean;
  connectedHere: boolean;
  connectedElsewhere: boolean;
}

interface Data {
  configured: boolean;
  canManage: boolean;
  setup: {
    webhookUrl: string | null;
    redirectUrl: string | null;
    hasAppId: boolean;
    hasAppSecret: boolean;
    hasVerifyToken: boolean;
    hasPublicUrl: boolean;
  } | null;
  connections: Connection[];
  pending: PendingPage[];
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo deu errado");
  return data;
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
          {value || "(defina PUBLIC_APP_URL no Railway)"}
        </code>
        {value && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Copiar"
          >
            {copied ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SetupCard({ setup }: { setup: NonNullable<Data["setup"]> }) {
  const items = [
    { ok: setup.hasAppId, label: "META_APP_ID" },
    { ok: setup.hasAppSecret, label: "META_APP_SECRET" },
    { ok: setup.hasVerifyToken, label: "META_VERIFY_TOKEN" },
    { ok: setup.hasPublicUrl, label: "PUBLIC_APP_URL" },
  ];
  const done = items.every((i) => i.ok);
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">Configuração do app da Meta (só o Master vê)</p>
        {done ? <Badge tone="green">Configurado</Badge> : <Badge tone="amber">Falta configurar</Badge>}
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Estas variáveis ficam no Railway, nos serviços do <b>site</b> e do <b>motor</b>. Os endereços abaixo vão no app da Meta
        (developers.facebook.com): o de retorno em &quot;Login do Facebook → URIs de redirecionamento&quot; e o do webhook em
        &quot;Webhooks&quot; (Página e Instagram, campo <b>messages</b>).
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {items.map((i) => (
          <span
            key={i.label}
            className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${i.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
          >
            {i.ok ? "✓" : "✗"} {i.label}
          </span>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CopyField label="URL de retorno do login (Valid OAuth Redirect URI)" value={setup.redirectUrl} />
        <CopyField label="URL do webhook (Callback URL)" value={setup.webhookUrl} />
      </div>
    </Card>
  );
}

function ConnectionCard({
  c,
  canManage,
  onChanged,
}: {
  c: Connection;
  canManage: boolean;
  onChanged: (list: Connection[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api(`/api/meta/connections/${c.id}`, "PATCH", body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm(`Desconectar a página "${c.pageName}"? As conversas já recebidas continuam salvas.`)) return;
    setBusy(true);
    try {
      onChanged(await api(`/api/meta/connections/${c.id}`, "DELETE"));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Globe size={22} />
          </span>
          <div>
            <p className="font-semibold text-slate-900">{c.pageName || c.pageId}</p>
            <p className="text-sm text-slate-500">
              {c.igUsername ? (
                <>
                  Instagram <b>@{c.igUsername}</b>
                </>
              ) : (
                "Sem Instagram ligado a esta página"
              )}
            </p>
          </div>
        </div>
        {c.lastError ? <Badge tone="red">Com erro</Badge> : <Badge tone="green">Conectada</Badge>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <AtSign size={16} className="text-pink-600" /> Direct do Instagram
          </p>
          {c.igUserId ? (
            <Toggle
              checked={c.instagramEnabled}
              onChange={(v) => canManage && !busy && patch({ instagramEnabled: v })}
              label={c.instagramEnabled ? "Recebendo mensagens" : "Desligado"}
            />
          ) : (
            <p className="text-xs text-slate-500">
              Ligue o Instagram profissional da empresa a esta página (no Instagram: Configurações → Central de contas) e conecte de novo.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MessageCircle size={16} className="text-blue-600" /> Messenger do Facebook
          </p>
          <Toggle
            checked={c.messengerEnabled}
            onChange={(v) => canManage && !busy && patch({ messengerEnabled: v })}
            label={c.messengerEnabled ? "Recebendo mensagens" : "Desligado"}
          />
        </div>
      </div>

      {c.lastError && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {c.lastError}
        </p>
      )}
      <ErrorNote message={error} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {c.lastEventAt
            ? `Última mensagem recebida: ${new Date(c.lastEventAt).toLocaleString("pt-BR")}`
            : "Ainda não chegou nenhuma mensagem por aqui."}
        </span>
        {canManage && (
          <Button variant="ghost" onClick={disconnect} disabled={busy}>
            <Unplug size={15} /> Desconectar
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SocialScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(params.get("erro"));
  const [picking, setPicking] = useState(params.get("escolher") === "1");
  const [busyPage, setBusyPage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/meta/connections", "GET"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closePicker = async (cancel: boolean) => {
    setPicking(false);
    router.replace("/redes-sociais");
    if (cancel) await api("/api/meta/connections", "POST", { cancel: true }).catch(() => {});
    load();
  };

  const connect = async (pageId: string) => {
    setBusyPage(pageId);
    setError(null);
    try {
      await api("/api/meta/connections", "POST", { pageId });
      await closePicker(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyPage(null);
    }
  };

  if (!data) {
    return (
      <Page>
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Instagram e Facebook"
        description="Conecte o Direct do Instagram e o Messenger da página. As conversas entram em Leads junto com o WhatsApp, e a IA atende com as mesmas regras, catálogo e agenda."
        actions={
          data.canManage && data.configured ? (
            <a href="/api/meta/connect" className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
              <Plug size={16} /> {data.connections.length ? "Conectar outra página" : "Conectar com Facebook"}
            </a>
          ) : null
        }
      />

      {data.setup && <SetupCard setup={data.setup} />}
      <ErrorNote message={error} />

      {!data.configured && !data.setup && (
        <Card className="p-6 text-sm text-slate-600">
          A conexão com Instagram e Facebook ainda não foi ativada na plataforma. Fale com quem te cadastrou.
        </Card>
      )}

      {data.configured && data.connections.length === 0 && (
        <Card className="p-8 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
            <Link2 size={26} />
          </span>
          <p className="font-semibold text-slate-900">Nenhuma página conectada</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">
            Clique em <b>Conectar com Facebook</b>, entre com a conta que administra a página da empresa e autorize. O Instagram
            profissional ligado à página vem junto.
          </p>
          {!data.canManage && <p className="mt-3 text-xs text-slate-500">Só o administrador da conta pode conectar.</p>}
        </Card>
      )}

      <div className="space-y-4">
        {data.connections.map((c) => (
          <ConnectionCard
            key={c.id}
            c={c}
            canManage={data.canManage}
            onChanged={(list) => setData({ ...data, connections: list })}
          />
        ))}
      </div>

      <Modal
        title="Escolha a página"
        open={picking && data.pending.length > 0}
        onClose={() => closePicker(true)}
      >
        <p className="mb-4 text-sm text-slate-600">
          Estas são as páginas que você autorizou. Conecte a página da empresa (o Instagram ligado a ela vem junto).
        </p>
        <div className="space-y-2">
          {data.pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">
                  {p.hasInstagram ? `Instagram @${p.igUsername || "conectado"}` : "Sem Instagram ligado"}
                </p>
              </div>
              {p.connectedElsewhere ? (
                <Badge tone="amber">Em outra conta</Badge>
              ) : (
                <Button onClick={() => connect(p.id)} disabled={Boolean(busyPage)}>
                  {busyPage === p.id ? <Loader2 size={15} className="animate-spin" /> : null}
                  {p.connectedHere ? "Reconectar" : "Conectar"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </Page>
  );
}
