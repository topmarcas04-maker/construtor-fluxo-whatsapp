"use client";

import { useCallback, useEffect, useState } from "react";
import type { Seller, Tag } from "@/lib/types/sdr";
import { TAG_COLOR_CLASSES } from "@/lib/types/sdr";

interface Rule {
  id: string;
  region: string | null;
  saleType: "ANY" | "WHOLESALE" | "RETAIL";
  priority: number;
  active: boolean;
  seller: Seller;
}

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
}

const TAG_COLORS = ["blue", "green", "orange", "red", "purple", "gray"];
const SALE_TYPE_LABEL: Record<string, string> = {
  ANY: "Qualquer tipo",
  WHOLESALE: "Atacado",
  RETAIL: "Varejo",
};

export default function ConfiguracoesPage() {
  const [prompt, setPrompt] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptLoaded, setPromptLoaded] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [newSellerName, setNewSellerName] = useState("");

  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleRegion, setRuleRegion] = useState("");
  const [ruleSaleType, setRuleSaleType] = useState("ANY");
  const [ruleSellerId, setRuleSellerId] = useState("");
  const [rulePriority, setRulePriority] = useState(0);

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrShortcut, setQrShortcut] = useState("");
  const [qrMessage, setQrMessage] = useState("");

  const loadAll = useCallback(async () => {
    const [settingsRes, tagsRes, sellersRes, rulesRes, qrRes] = await Promise.all([
      fetch("/api/sdr/settings"),
      fetch("/api/sdr/tags"),
      fetch("/api/sdr/sellers"),
      fetch("/api/sdr/rules"),
      fetch("/api/sdr/quick-replies"),
    ]);
    setPrompt((await settingsRes.json()).systemPrompt || "");
    setPromptLoaded(true);
    setTags(await tagsRes.json());
    setSellers(await sellersRes.json());
    setRules(await rulesRes.json());
    setQuickReplies(await qrRes.json());
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const savePrompt = async () => {
    setPromptSaving(true);
    try {
      await fetch("/api/sdr/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt }),
      });
    } finally {
      setPromptSaving(false);
    }
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    await fetch("/api/sdr/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName, color: newTagColor }),
    });
    setNewTagName("");
    loadAll();
  };

  const removeTag = async (id: string) => {
    await fetch(`/api/sdr/tags/${id}`, { method: "DELETE" });
    loadAll();
  };

  const addSeller = async () => {
    if (!newSellerName.trim()) return;
    await fetch("/api/sdr/sellers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSellerName }),
    });
    setNewSellerName("");
    loadAll();
  };

  const addRule = async () => {
    if (!ruleSellerId) return;
    await fetch("/api/sdr/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: ruleRegion || null,
        saleType: ruleSaleType,
        sellerId: ruleSellerId,
        priority: rulePriority,
      }),
    });
    setRuleRegion("");
    setRuleSaleType("ANY");
    setRuleSellerId("");
    setRulePriority(0);
    loadAll();
  };

  const removeRule = async (id: string) => {
    await fetch(`/api/sdr/rules/${id}`, { method: "DELETE" });
    loadAll();
  };

  const addQuickReply = async () => {
    if (!qrShortcut.trim() || !qrMessage.trim()) return;
    await fetch("/api/sdr/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut: qrShortcut, message: qrMessage }),
    });
    setQrShortcut("");
    setQrMessage("");
    loadAll();
  };

  const removeQuickReply = async (id: string) => {
    await fetch(`/api/sdr/quick-replies/${id}`, { method: "DELETE" });
    loadAll();
  };

  return (
    <div className="max-w-4xl space-y-8 overflow-y-auto p-8">
      {/* IA de triagem */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-semibold text-gray-800">IA de triagem — o que ela sabe</h2>
        <p className="mt-1 text-sm text-gray-500">
          Descrição do negócio, produtos e tom de voz que a IA usa pra responder no
          WhatsApp. Regras fixas (nunca informar preço/prazo/pagamento, sempre passar
          pra um vendedor quando pedido) continuam garantidas pelo sistema, mesmo se
          você mudar este texto.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={7}
          disabled={!promptLoaded}
          className="mt-4 w-full resize-y rounded-lg border border-gray-200 p-3 text-sm focus:border-[color:var(--accent)] focus:outline-none"
        />
        <button
          onClick={savePrompt}
          disabled={promptSaving}
          className="mt-3 rounded-lg bg-[color:var(--accent-dark)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {promptSaving ? "Salvando..." : "Salvar"}
        </button>
      </section>

      {/* Etiquetas */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-semibold text-gray-800">Etiquetas</h2>
        <p className="mt-1 text-sm text-gray-500">
          Marcadas manualmente no card do lead ou pela IA sozinha. Vendedores só veem
          e marcam — cadastrar é só aqui.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                TAG_COLOR_CLASSES[tag.color] || TAG_COLOR_CLASSES.gray
              }`}
            >
              {tag.name}
              <button onClick={() => removeTag(tag.id)} className="text-current opacity-60 hover:opacity-100">
                ×
              </button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-sm text-gray-400">Nenhuma etiqueta ainda.</p>}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Ex.: Financiamento"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-1">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                aria-label={color}
                className={`h-7 w-7 rounded-full border-2 ${
                  newTagColor === color ? "border-gray-800" : "border-transparent"
                } ${TAG_COLOR_CLASSES[color].split(" ")[0]}`}
              />
            ))}
          </div>
          <button
            onClick={addTag}
            className="rounded-lg bg-[color:var(--accent-dark)] px-4 py-2 text-sm font-medium text-white"
          >
            Adicionar etiqueta
          </button>
        </div>
      </section>

      {/* Vendedores */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-semibold text-gray-800">Vendedores</h2>
        <p className="mt-1 text-sm text-gray-500">
          Quem recebe os leads distribuídos pelas regras abaixo, ou manualmente pelo
          inbox e pelo funil.
        </p>
        <ul className="mt-4 space-y-1">
          {sellers.map((s) => (
            <li key={s.id} className="text-sm text-gray-700">
              {s.name}
            </li>
          ))}
          {sellers.length === 0 && <p className="text-sm text-gray-400">Nenhum vendedor cadastrado.</p>}
        </ul>
        <div className="mt-4 flex gap-2">
          <input
            value={newSellerName}
            onChange={(e) => setNewSellerName(e.target.value)}
            placeholder="Nome do vendedor"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            onClick={addSeller}
            className="rounded-lg bg-[color:var(--accent-dark)] px-4 py-2 text-sm font-medium text-white"
          >
            Adicionar vendedor
          </button>
        </div>
      </section>

      {/* Regras de distribuição */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-semibold text-gray-800">Regras de distribuição (em ordem de prioridade)</h2>
        <p className="mt-1 text-sm text-gray-500">
          A primeira regra ativa que bater com a região/tipo de compra do lead vence.
          Sem nenhuma regra batendo, o sistema distribui pro vendedor ativo com menos
          leads no momento.
        </p>

        <div className="mt-4 space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <span>
                {rule.region || "Qualquer região"} · {SALE_TYPE_LABEL[rule.saleType]} →{" "}
                <strong>{rule.seller.name}</strong> (prioridade {rule.priority})
              </span>
              <button onClick={() => removeRule(rule.id)} className="text-red-500 hover:underline">
                Remover
              </button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-sm text-gray-400">
              Nenhuma regra cadastrada ainda — todo lead cai no rodízio por menor carga.
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Região (cidade/bairro — vazio = qualquer região)
            </label>
            <input
              value={ruleRegion}
              onChange={(e) => setRuleRegion(e.target.value)}
              placeholder="Ex.: São Paulo"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tipo de venda</label>
            <select
              value={ruleSaleType}
              onChange={(e) => setRuleSaleType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="ANY">Qualquer tipo</option>
              <option value="WHOLESALE">Atacado</option>
              <option value="RETAIL">Varejo</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Vendedor</label>
            <select
              value={ruleSellerId}
              onChange={(e) => setRuleSellerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Ordem (prioridade)</label>
            <input
              type="number"
              value={rulePriority}
              onChange={(e) => setRulePriority(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={addRule}
          className="mt-3 rounded-lg bg-[color:var(--accent-dark)] px-4 py-2 text-sm font-medium text-white"
        >
          Adicionar regra
        </button>
      </section>

      {/* Respostas rápidas */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 pb-8">
        <h2 className="font-semibold text-gray-800">Respostas rápidas</h2>
        <p className="mt-1 text-sm text-gray-500">
          Digitando &quot;/&quot; + o atalho no chat, aparece essa lista pra escolher e
          enviar na hora.
        </p>

        <div className="mt-4 space-y-2">
          {quickReplies.map((qr) => (
            <div key={qr.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
              <div>
                <span className="font-mono text-[color:var(--accent-dark)]">/{qr.shortcut}</span>
                <p className="text-gray-600">{qr.message}</p>
              </div>
              <button onClick={() => removeQuickReply(qr.id)} className="shrink-0 text-red-500 hover:underline">
                Remover
              </button>
            </div>
          ))}
          {quickReplies.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma resposta rápida cadastrada.</p>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[160px_1fr]">
          <div>
            <label className="text-xs font-medium text-gray-600">Atalho</label>
            <div className="mt-1 flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="text-gray-400">/</span>
              <input
                value={qrShortcut}
                onChange={(e) => setQrShortcut(e.target.value)}
                placeholder="oi"
                className="ml-1 w-full outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Mensagem</label>
            <textarea
              value={qrMessage}
              onChange={(e) => setQrMessage(e.target.value)}
              placeholder="Texto que será sugerido/enviado..."
              rows={2}
              className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={addQuickReply}
          className="mt-3 rounded-lg bg-[color:var(--accent-dark)] px-4 py-2 text-sm font-medium text-white"
        >
          Adicionar resposta rápida
        </button>
      </section>
    </div>
  );
}
