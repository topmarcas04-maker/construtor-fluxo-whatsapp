"use client";

import { useState } from "react";
import { ChevronDown, Package, Users, Workflow, Sparkles, Loader2 } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { hasOwnRules, type WaNumberConfig } from "@/lib/whatsapp/config";

export interface RulesOptions {
  products: { id: string; name: string; active: boolean }[];
  sellers: { id: string; name: string; active: boolean }[];
  funnels: { id: string; name: string; isDefault: boolean }[];
}

function Chips({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; name: string; active: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) return <p className="text-xs text-slate-400">Nenhum cadastrado.</p>;
  return (
    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-500 hover:border-slate-300"
            } ${it.active ? "" : "opacity-50"}`}
            title={it.active ? undefined : "Desativado"}
          >
            {it.name}
          </button>
        );
      })}
    </div>
  );
}

/** Regras próprias de um WhatsApp: produtos, vendedores, funil e orientação da IA */
export function NumberRules({
  slot,
  initial,
  options,
}: {
  slot: number;
  initial: WaNumberConfig;
  options: RulesOptions;
}) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<WaNumberConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (key: "productIds" | "sellerIds", id: string) => {
    setMsg(null);
    setC((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((v) => v !== id) : [...x[key], id] }));
  };

  const funnelName = options.funnels.find((f) => f.id === c.funnelId)?.name;
  const summary = hasOwnRules(c)
    ? [
        c.productIds.length ? `${c.productIds.length} produto${c.productIds.length > 1 ? "s" : ""}` : null,
        c.sellerIds.length ? `${c.sellerIds.length} vendedor${c.sellerIds.length > 1 ? "es" : ""}` : null,
        funnelName ? `funil ${funnelName}` : null,
        c.aiInstructions ? "orientação da IA" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Usa o padrão da conta";

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/sdr/whatsapp/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, config: c }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setC(data.config);
      setMsg("Salvo!");
    } else setMsg(data.error || "Não foi possível salvar");
    setSaving(false);
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold text-slate-800">Regras deste número</span>
          <span className="text-xs text-slate-500">{summary}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Package size={13} /> Produtos que a IA oferece aqui
            </p>
            <Chips items={options.products} selected={c.productIds} onToggle={(id) => toggle("productIds", id)} />
            <p className="mt-1 text-[11px] text-slate-400">Nenhum marcado = todos os produtos da conta.</p>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Users size={13} /> Vendedores que recebem os leads daqui
            </p>
            <Chips items={options.sellers} selected={c.sellerIds} onToggle={(id) => toggle("sellerIds", id)} />
            <p className="mt-1 text-[11px] text-slate-400">
              Nenhum marcado = distribuição normal. Marcados = a fila e as regras usam só eles.
            </p>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Workflow size={13} /> Funil dos leads novos
            </p>
            <select
              value={c.funnelId || ""}
              onChange={(e) => {
                setMsg(null);
                setC((x) => ({ ...x, funnelId: e.target.value || null }));
              }}
              className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Funil padrão</option>
              {options.funnels
                .filter((f) => !f.isDefault)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sparkles size={13} /> Orientação extra para a IA neste número
            </p>
            <Textarea
              rows={3}
              value={c.aiInstructions}
              maxLength={1500}
              onChange={(e) => {
                setMsg(null);
                setC((x) => ({ ...x, aiInstructions: e.target.value }));
              }}
              placeholder='Ex.: "Este número é do pós-venda: ajude com revisão, peças e garantia."'
            />
            <p className="mt-1 text-[11px] text-slate-400">Soma com as instruções gerais da IA (Configurações → Atendimento IA).</p>
          </div>
          <div className="flex items-center justify-end gap-3">
            {msg && <span className={`text-sm font-semibold ${msg === "Salvo!" ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null} Salvar regras
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
