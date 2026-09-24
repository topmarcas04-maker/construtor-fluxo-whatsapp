"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check } from "lucide-react";
import { Button, Input } from "@/components/ui";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

function CopyBox({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 pr-12 text-[12px] leading-relaxed text-slate-100">{text}</pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20"
        title="Copiar"
      >
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/** Configurações → API: chaves e exemplos para ligar outros sistemas (ex.: rastreamento) */
export function ApiTab() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState("https://seu-sistema");
  useEffect(() => setBase(window.location.origin), []);

  const load = useCallback(async () => {
    const r = await fetch("/api/sdr/api-keys", { cache: "no-store" });
    if (r.ok) setKeys(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setError(null);
    const r = await fetch("/api/sdr/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Integração" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "Não foi possível criar a chave");
    setNewKey(d.key);
    setName("");
    load();
  };

  const remove = async (k: ApiKeyRow) => {
    if (!confirm(`Apagar a chave "${k.name}"? O sistema que usa esta chave para de funcionar na hora.`)) return;
    await fetch(`/api/sdr/api-keys/${k.id}`, { method: "DELETE" });
    load();
  };

  const key = newKey || "rsk_SUA_CHAVE";
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <KeyRound size={17} /> Chaves de API
        </p>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Use uma chave para outros sistemas (ex.: sua plataforma de rastreamento) mandarem mensagens de WhatsApp e criarem leads nesta conta.
          Crie uma chave por sistema; se apagar, ele para de funcionar na hora.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder='Nome (ex.: "Rastreamento")' value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create}>
          <Plus size={16} /> Criar chave
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {newKey && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-800">Copie a chave agora — por segurança ela não aparece de novo:</p>
          <CopyBox text={newKey} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        {keys.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhuma chave ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Chave</th>
                <th className="px-4 py-3">Último uso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{k.prefix}…</td>
                  <td className="px-4 py-3 text-slate-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("pt-BR") : "nunca"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(k)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Apagar">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900">Como usar (passe para quem programa o outro sistema)</p>
        <p className="text-sm text-slate-600">
          Toda chamada leva a chave no cabeçalho <code className="rounded bg-slate-100 px-1">Authorization: Bearer {"<chave>"}</code>. Respostas em JSON com{" "}
          <code className="rounded bg-slate-100 px-1">ok: true</code> ou <code className="rounded bg-slate-100 px-1">ok: false</code> e{" "}
          <code className="rounded bg-slate-100 px-1">error</code>. Limite: 120 chamadas por minuto por chave.
        </p>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-800">1. Testar a chave</p>
          <CopyBox text={`curl ${base}/api/v1/ping \\\n  -H "Authorization: Bearer ${key}"`} />
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-800">2. Enviar mensagem de WhatsApp (ex.: alerta do rastreador)</p>
          <CopyBox
            text={`curl -X POST ${base}/api/v1/messages \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "to": "16999998888",\n    "text": "🚨 Alerta: a moto ABC-1234 saiu da cerca virtual às 14:32.\\nVer no mapa: https://maps.google.com/?q=-21.6,-48.8",\n    "lead": { "name": "João Silva", "tags": ["Rastreamento"], "ia": false }\n  }'`}
          />
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li><b>to</b>: número com DDD (o sistema confere se tem WhatsApp e acerta o 9º dígito).</li>
            <li><b>text</b>: a mensagem. Aceita *negrito* do WhatsApp e quebras de linha (\n).</li>
            <li><b>mediaUrl</b> (opcional): link de uma foto (jpg/png/webp) ou arquivo (ex.: PDF do relatório), até 8 MB. <b>caption</b>/<b>fileName</b> opcionais.</li>
            <li>
              <b>lead</b> (opcional): cria/atualiza o cliente no painel para você ver o histórico. <b>ia: false</b> faz a IA NÃO responder se o cliente responder o
              alerta (a equipe atende). Sem <b>lead</b>, a mensagem é enviada, mas só aparece no painel se o número já for um lead.
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-800">3. Criar ou atualizar lead (ex.: cliente novo do rastreamento)</p>
          <CopyBox
            text={`curl -X POST ${base}/api/v1/leads \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "phone": "16999998888",\n    "name": "João Silva",\n    "city": "Itápolis",\n    "note": "Plano Rastreamento 24h - placa ABC-1234",\n    "tags": ["Rastreamento", "Cliente ativo"],\n    "column": "Lead quente",\n    "ia": true\n  }'`}
          />
          <p className="mt-2 text-xs text-slate-600">
            O mesmo telefone não duplica: a chamada atualiza o lead. <b>column</b> é o nome de uma coluna do funil; <b>tags</b> que não existem são criadas.
          </p>
        </div>
      </div>
    </div>
  );
}
