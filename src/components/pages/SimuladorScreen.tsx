"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, CreditCard, Pencil, Plus, Trash2, Wifi, Layers, ArrowDownToLine, ArrowUpFromLine, Landmark } from "lucide-react";
import { Page, PageHeader, Button, Modal, ErrorNote, EmptyState } from "@/components/ui";
import {
  MACHINE_COLORS,
  MAX_INSTALLMENTS,
  brl,
  pct,
  simulate,
  simulationText,
  type CardMachine,
  type SimMode,
} from "@/lib/simulador/common";

interface Data {
  machines: CardMachine[];
  canEdit: boolean;
  taxRate: number;
  taxSource: string | null;
  canEditTax: boolean;
}

interface Draft {
  id?: string;
  name: string;
  color: string;
  debitRate: string;
  rates: string[];
}

const HIGHLIGHT = [12, 18, 21];
const toStr = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const emptyDraft = (): Draft => ({ name: "", color: MACHINE_COLORS[1], debitRate: "", rates: Array(MAX_INSTALLMENTS).fill("") });
const draftFrom = (m: CardMachine, copy = false): Draft => ({
  id: copy ? undefined : m.id,
  name: copy ? `${m.name} (minha)` : m.name,
  color: m.color,
  debitRate: toStr(m.debitRate),
  rates: Array.from({ length: MAX_INSTALLMENTS }, (_, i) => toStr(m.rates[i])),
});

/** Campo de dinheiro estilo maquininha: os dígitos entram pela direita (centavos) */
function moneyFromDigits(d: string) {
  const n = parseInt(d.replace(/\D/g, "").slice(0, 11) || "0", 10);
  return n / 100;
}

export function SimuladorScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [mode, setMode] = useState<SimMode>("RECEBER");
  const [digits, setDigits] = useState("100000");
  const [picked, setPicked] = useState<string[]>([]);
  const [focus, setFocus] = useState<string>("c12");
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [taxEdit, setTaxEdit] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/simulador");
    if (!res.ok) return;
    const d: Data = await res.json();
    setData(d);
    setMachineId((cur) => (cur && d.machines.some((m) => m.id === cur) ? cur : d.machines[0]?.id || null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const machine = data?.machines.find((m) => m.id === machineId) || null;
  const value = moneyFromDigits(digits);
  const taxRate = data?.taxRate || 0;
  const hasTax = taxRate > 0;
  const rows = useMemo(() => (machine ? simulate(machine, value, mode, taxRate) : []), [machine, value, mode, taxRate]);
  const focused = rows.find((r) => r.key === focus) || rows.find((r) => r.installments === 12) || rows[rows.length - 1];

  const togglePick = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const copy = async () => {
    if (!machine) return;
    await navigator.clipboard.writeText(simulationText(machine.name, rows, picked));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const body = { name: draft.name, color: draft.color, debitRate: draft.debitRate, rates: draft.rates };
    const res = await fetch(draft.id ? `/api/simulador/${draft.id}` : "/api/simulador", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return setError(out.error || "Não foi possível salvar");
    setDraft(null);
    if (out.id) setMachineId(out.id);
    load();
  };
  const saveTax = async () => {
    if (taxEdit === null) return;
    const res = await fetch("/api/simulador", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxRate: taxEdit }) });
    if (!res.ok) return alert((await res.json()).error || "Não foi possível salvar");
    setTaxEdit(null);
    load();
  };
  const remove = async (m: CardMachine) => {
    if (!confirm(`Remover a maquininha "${m.name}"?`)) return;
    const res = await fetch(`/api/simulador/${m.id}`, { method: "DELETE" });
    if (!res.ok) return alert((await res.json()).error || "Não foi possível remover");
    load();
  };

  if (!data) return <Page><p className="text-slate-500">Carregando…</p></Page>;

  return (
    <Page>
      <PageHeader
        title="Simulador de cartão"
        description="Veja o valor das parcelas, quanto cobrar do cliente e quanto cai na sua conta em cada maquininha."
        actions={data.canEdit ? <Button onClick={() => { setError(null); setDraft(emptyDraft()); }}><Plus size={16} /> Nova maquininha</Button> : undefined}
      />

      {data.machines.length === 0 ? (
        <EmptyState title="Nenhuma maquininha cadastrada" text={data.canEdit ? "Cadastre as taxas da sua maquininha para começar a simular." : "Peça ao administrador para cadastrar as taxas."} />
      ) : (
        <>
          {/* Maquininhas, como cartões */}
          <div className="-mx-1 mb-6 flex gap-4 overflow-x-auto px-1 pb-2">
            {data.machines.map((m) => {
              const on = m.id === machineId;
              return (
                <button
                  key={m.id}
                  onClick={() => setMachineId(m.id)}
                  className={`group relative h-[118px] w-[200px] shrink-0 overflow-hidden rounded-2xl p-4 text-left text-white transition ${
                    on ? "ring-4 ring-[var(--accent)]/30 ring-offset-2" : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}cc 55%, #00000055)` }}
                >
                  <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
                  <span className="pointer-events-none absolute -bottom-12 right-6 h-24 w-24 rounded-full bg-white/5" />
                  <div className="flex items-center justify-between">
                    <span className="h-6 w-8 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" />
                    <Wifi size={16} className="rotate-90 opacity-70" />
                  </div>
                  <p className="mt-4 truncate text-[15px] font-bold">{m.name}</p>
                  <p className="text-[11px] uppercase tracking-wider opacity-70">{m.own ? "Minha tabela" : `Padrão · ${m.ownerName}`}</p>
                  {on && <Check size={16} className="absolute bottom-3 right-3" />}
                </button>
              );
            })}
          </div>

          {machine && (
            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              {/* A maquininha */}
              <div className="space-y-4">
                <div className="rounded-[28px] bg-gradient-to-b from-slate-800 to-slate-950 p-4 shadow-2xl shadow-slate-900/30">
                  <div className="mb-3 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    <span className="flex items-center gap-1.5"><CreditCard size={13} /> {machine.name}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Pronta</span>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-200 p-5 shadow-inner">
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-300/60 p-1 text-[13px] font-semibold">
                      {([
                        ["RECEBER", "Quero receber", ArrowDownToLine],
                        ["COBRAR", "Vou cobrar", ArrowUpFromLine],
                      ] as const).map(([k, l, Icon]) => (
                        <button
                          key={k}
                          onClick={() => setMode(k)}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${mode === k ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          <Icon size={14} /> {l}
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      {mode === "RECEBER" ? (hasTax ? "Preço à vista (já com imposto)" : "Valor à vista que você quer receber") : "Valor passado na maquininha"}
                    </p>
                    <input
                      inputMode="numeric"
                      value={brl(value)}
                      onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
                      className="mt-1 w-full bg-transparent font-mono text-[34px] font-bold tracking-tight text-slate-900 outline-none"
                    />
                    <div className="mt-3 border-t border-slate-300 pt-3">
                      {focused ? (
                        <>
                          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{focused.label}</p>
                          <p className="font-mono text-[26px] font-bold text-[var(--accent)]">
                            {focused.installments > 1 ? `${focused.installments}x ${brl(focused.installment)}` : brl(focused.charged)}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                            <div className="rounded-lg bg-white/70 px-3 py-2">
                              <span className="block text-[11px] text-slate-500">Cliente paga</span>
                              <b className="text-slate-900">{brl(focused.charged)}</b>
                            </div>
                            <div className="rounded-lg bg-white/70 px-3 py-2">
                              <span className="block text-[11px] text-slate-500">{hasTax ? "Líquido (após imposto)" : "Você recebe"}</span>
                              <b className="text-emerald-700">{brl(hasTax ? focused.liquid : focused.net)}</b>
                            </div>
                          </div>
                          <p className="mt-2 text-[12px] text-slate-500">
                            Maquininha {pct(focused.rate)} · {brl(focused.fee)}
                            {hasTax && <> · Imposto {pct(taxRate)} · {brl(focused.tax)}</>}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">Digite um valor.</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "⌫"].map((k) => (
                      <button
                        key={String(k)}
                        onClick={() =>
                          setDigits((d) => (k === "C" ? "" : k === "⌫" ? d.slice(0, -1) : (d + String(k)).replace(/^0+/, "").slice(0, 11)))
                        }
                        className={`rounded-xl py-3 font-mono text-lg font-bold transition active:scale-95 ${
                          k === "C" ? "bg-rose-500/90 text-white" : k === "⌫" ? "bg-amber-400/90 text-slate-900" : "bg-slate-700/80 text-white hover:bg-slate-600"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Destaques */}
                <div className="grid grid-cols-3 gap-3">
                  {HIGHLIGHT.map((n) => {
                    const r = rows.find((x) => x.key === `c${n}`);
                    return (
                      <button
                        key={n}
                        disabled={!r}
                        onClick={() => r && setFocus(r.key)}
                        className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition disabled:opacity-40 ${focus === `c${n}` ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"}`}
                      >
                        <span className="text-[12px] font-bold text-slate-500">{n}x</span>
                        <p className="font-mono text-[15px] font-bold text-slate-900">{r ? brl(r.installment) : "—"}</p>
                        <span className="text-[11px] text-slate-500">{r ? `total ${brl(r.charged)}` : "não parcela"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tabela completa */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: machine.color }}><Layers size={17} /></span>
                    <div>
                      <p className="font-semibold text-slate-900">{machine.name}</p>
                      <p className="text-[12px] text-slate-500">
                        {mode === "RECEBER" ? (hasTax ? "Taxa e imposto repassados ao cliente" : "Taxa repassada ao cliente") : "Taxa e imposto descontados de você"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px]">
                    <Landmark size={15} className="text-slate-500" />
                    {taxEdit === null ? (
                      <>
                        <span className="text-slate-600">Imposto sobre a nota</span>
                        <b className="font-mono text-slate-900">{pct(taxRate)}</b>
                        {data.canEditTax ? (
                          <button onClick={() => setTaxEdit(String(taxRate).replace(".", ","))} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800" title="Alterar imposto"><Pencil size={13} /></button>
                        ) : data.taxSource ? (
                          <span className="text-[11px] text-slate-400">definido por {data.taxSource}</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <input autoFocus inputMode="decimal" value={taxEdit} onChange={(e) => setTaxEdit(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && saveTax()} className="w-16 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-right font-mono outline-none focus:border-[var(--accent)]" />
                        <span className="text-slate-500">%</span>
                        <button onClick={saveTax} className="rounded-md bg-[var(--accent)] px-2 py-0.5 text-[12px] font-semibold text-white">Salvar</button>
                        <button onClick={() => setTaxEdit(null)} className="text-[12px] text-slate-500">Cancelar</button>
                      </>
                    )}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {data.canEdit && machine.own && (
                      <>
                        <Button variant="ghost" onClick={() => { setError(null); setDraft(draftFrom(machine)); }}><Pencil size={15} /> Editar taxas</Button>
                        <Button variant="ghost" onClick={() => remove(machine)}><Trash2 size={15} /></Button>
                      </>
                    )}
                    {data.canEdit && !machine.own && (
                      <Button variant="ghost" onClick={() => { setError(null); setDraft(draftFrom(machine, true)); }}><Copy size={15} /> Usar como base</Button>
                    )}
                    <Button onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copiado!" : picked.length ? `Copiar ${picked.length} opções` : "Copiar para o cliente"}</Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-[14px]">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="w-10 px-4 py-3" />
                        <th className="px-3 py-3">Forma</th>
                        <th className="px-3 py-3 text-right">Taxa</th>
                        <th className="px-3 py-3 text-right">Parcela</th>
                        <th className="px-3 py-3 text-right">Cliente paga</th>
                        <th className="px-3 py-3 text-right">Taxa R$</th>
                        {hasTax && <th className="px-3 py-3 text-right">Imposto R$</th>}
                        <th className="px-4 py-3 text-right">{hasTax ? "Líquido" : "Você recebe"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const hl = HIGHLIGHT.includes(r.installments) && r.key !== "debito";
                        const on = focus === r.key;
                        return (
                          <tr
                            key={r.key}
                            onClick={() => setFocus(r.key)}
                            className={`cursor-pointer border-t border-slate-100 transition ${on ? "bg-cyan-50/70" : hl ? "bg-amber-50/40 hover:bg-slate-50" : "hover:bg-slate-50"}`}
                          >
                            <td className="px-4 py-2.5" onClick={(e) => { e.stopPropagation(); togglePick(r.key); }}>
                              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${picked.includes(r.key) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-300 bg-white"}`}>
                                {picked.includes(r.key) && <Check size={13} />}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800">
                              {r.label}
                              {hl && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">destaque</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-500">{pct(r.rate)}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">{r.installments > 1 ? `${r.installments}x ${brl(r.installment)}` : brl(r.installment)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-800">{brl(r.charged)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-rose-600">−{brl(r.fee)}</td>
                            {hasTax && <td className="px-3 py-2.5 text-right font-mono text-rose-600">−{brl(r.tax)}</td>}
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">{brl(hasTax ? r.liquid : r.net)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
                  Marque as opções que quer mandar e toque em copiar — o texto sai pronto para colar no WhatsApp, só com parcelas e total.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {draft && (
        <Modal open title={draft.id ? "Editar maquininha" : "Nova maquininha"} onClose={() => setDraft(null)} wide>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Nome</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex.: Mastercard, Stone, PagSeguro"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                />
              </label>
              <div>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Cor</span>
                <div className="flex gap-1.5 pt-1">
                  {MACHINE_COLORS.map((c) => (
                    <button key={c} onClick={() => setDraft({ ...draft, color: c })} className={`h-8 w-8 rounded-full ${draft.color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} style={{ background: c }} aria-label={c} />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Taxas em % <span className="font-normal text-slate-500">(deixe vazio o que a maquininha não faz)</span></p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <RateInput label="Débito" value={draft.debitRate} onChange={(v) => setDraft({ ...draft, debitRate: v })} />
                {draft.rates.map((r, i) => (
                  <RateInput
                    key={i}
                    label={i === 0 ? "Crédito à vista" : `${i + 1}x`}
                    value={r}
                    onChange={(v) => setDraft({ ...draft, rates: draft.rates.map((x, j) => (j === i ? v : x)) })}
                  />
                ))}
              </div>
            </div>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function RateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[var(--accent)] focus-within:bg-white">
      <span className="w-[92px] shrink-0 text-[12px] font-semibold text-slate-600">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        placeholder="—"
        className="w-full min-w-0 bg-transparent text-right font-mono text-sm outline-none"
      />
      <span className="text-[12px] text-slate-400">%</span>
    </label>
  );
}
