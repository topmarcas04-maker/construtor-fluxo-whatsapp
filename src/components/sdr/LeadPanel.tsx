"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, CalendarPlus, Bot } from "lucide-react";
import { AppointmentModal } from "@/components/agenda/AppointmentModal";
import { type Appointment, STATUS_LABEL, STATUS_STYLE, spParts } from "@/components/agenda/types";
import type { Lead, Seller, Tag } from "@/lib/types/sdr";
import { TAG_COLOR_CLASSES, SALE_TYPE_LABEL } from "@/lib/types/sdr";

/** Lista de produtos (carregada uma vez) para escolher o produto de interesse */
let productCache: Promise<{ id: string; name: string; kind: string; active: boolean }[]> | null = null;
function loadProducts() {
  productCache ||= fetch("/api/products")
    .then((r) => (r.ok ? r.json() : { products: [] }))
    .then((d) => d.products || [])
    .catch(() => []);
  return productCache;
}

function scoreTone(score: number) {
  if (score >= 70) return { bar: "bg-emerald-500", text: "text-emerald-700", label: "Quente" };
  if (score >= 40) return { bar: "bg-amber-500", text: "text-amber-700", label: "Morno" };
  return { bar: "bg-slate-400", text: "text-slate-600", label: "Frio" };
}

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400";
const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

/** Campo de texto que salva ao sair do campo */
function BlurInput({
  value,
  onSave,
  placeholder,
  type = "text",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      className={inputCls}
    />
  );
}

export function LeadPanel({
  lead,
  tags,
  sellers,
  onPatch,
  canEdit,
}: {
  lead: Lead;
  tags: Tag[];
  sellers: Seller[];
  onPatch: (fields: Record<string, unknown>) => void;
  canEdit: boolean;
}) {
  const leadTagIds = new Set(lead.tags.map((t) => t.id));
  const [productList, setProductList] = useState<{ id: string; name: string; kind: string; active: boolean }[]>([]);
  useEffect(() => {
    loadProducts().then(setProductList);
  }, []);
  const [note, setNote] = useState(lead.note || "");
  useEffect(() => setNote(lead.note || ""), [lead.id, lead.note]);

  // Agendamentos deste lead
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [modal, setModal] = useState<{ appointment: Appointment | null } | null>(null);
  const modalDefaults = useMemo(() => ({ leadId: lead.id }), [lead.id]);
  const loadAppts = useCallback(() => {
    fetch(`/api/appointments?leadId=${lead.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAppts)
      .catch(() => {});
  }, [lead.id]);
  useEffect(() => {
    loadAppts();
  }, [loadAppts, lead.updatedAt]);

  return (
    <div className="space-y-5 p-5">
      <div>
        <p className="text-sm font-semibold text-slate-900">Ficha do lead</p>
        <p className="text-xs text-slate-400">
          Entrou em {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
          <Sparkles size={13} /> Qualificação da IA
        </p>
        {lead.score !== null ? (
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className={`font-semibold ${scoreTone(lead.score).text}`}>{scoreTone(lead.score).label}</span>
              <span className="font-semibold text-slate-700">{lead.score}/100</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white">
              <div
                className={`h-2 rounded-full ${scoreTone(lead.score).bar}`}
                style={{ width: `${Math.max(4, Math.min(100, lead.score))}%` }}
              />
            </div>
          </div>
        ) : null}
        <p className="text-sm leading-relaxed text-slate-700">
          {lead.aiSummary || "A IA ainda não resumiu este atendimento."}
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agenda</span>
          <button
            onClick={() => setModal({ appointment: null })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            <CalendarPlus size={13} /> Agendar
          </button>
        </div>
        {appts.length === 0 ? (
          <p className="text-sm text-slate-400">Nada agendado.</p>
        ) : (
          <div className="space-y-1.5">
            {appts.slice(-4).map((a) => {
              const p = spParts(a.startsAt);
              return (
                <button
                  key={a.id}
                  onClick={() => setModal({ appointment: a })}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800">
                    {p.date.split("-").reverse().slice(0, 2).join("/")} {p.time}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{a.title}</span>
                  {a.createdBy === "AI" && <Bot size={13} className="text-violet-500" />}
                  <span className={`rounded-full border px-1.5 text-[10px] ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                </button>
              );
            })}
          </div>
        )}
        <AppointmentModal
          open={modal !== null}
          appointment={modal?.appointment || null}
          defaults={modalDefaults}
          onClose={() => setModal(null)}
          onSaved={loadAppts}
        />
      </div>

      <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
      {!canEdit && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Somente leitura: você não tem permissão para editar os cards.
        </p>
      )}
      <div>
        <span className={labelCls}>Nome</span>
        <BlurInput
          value={lead.cardName && lead.cardName !== "Lead" ? lead.cardName : lead.conversation.leadName || ""}
          placeholder="Nome do cliente"
          onSave={(v) => onPatch({ cardName: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={labelCls}>Cidade</span>
          <BlurInput value={lead.city || ""} placeholder="—" onSave={(v) => onPatch({ city: v })} />
        </div>
        <div>
          <span className={labelCls}>Valor (R$)</span>
          <BlurInput
            type="number"
            value={lead.dealValue != null ? String(lead.dealValue) : ""}
            placeholder="0,00"
            onSave={(v) => onPatch({ dealValue: v })}
          />
        </div>
      </div>

      {Object.keys(lead.qualifyData || {}).length > 0 && (
        <div>
          <span className={labelCls}>Dados da qualificação</span>
          <div className="space-y-2">
            {Object.entries(lead.qualifyData || {}).map(([key, item]) => (
              <div key={key}>
                <span className="mb-0.5 block text-xs text-slate-500">{item.label}</span>
                <BlurInput value={item.value || ""} placeholder="—" onSave={(v) => onPatch({ qualifyData: { [key]: v } })} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className={labelCls}>Produto de interesse</span>
        <select
          value={lead.product?.id || ""}
          onChange={(e) => onPatch({ productId: e.target.value || null })}
          className={inputCls}
        >
          <option value="">{productList.length ? "Nenhum (a IA identifica pela conversa)" : "Nenhum produto cadastrado"}</option>
          {lead.product && !productList.some((p) => p.id === lead.product!.id) && (
            <option value={lead.product.id}>{lead.product.name}</option>
          )}
          {productList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.kind === "PLAN" ? " (plano)" : p.kind === "SERVICE" ? " (serviço)" : ""}
              {!p.active ? " — desligado" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={labelCls}>Interesse</span>
        <BlurInput
          value={lead.interest || ""}
          placeholder="Ex.: scooter 1000W, uso diário"
          onSave={(v) => onPatch({ interest: v })}
        />
      </div>

      <div>
        <span className={labelCls}>Tipo de compra</span>
        <select value={lead.saleType} onChange={(e) => onPatch({ saleType: e.target.value })} className={inputCls}>
          {Object.entries(SALE_TYPE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={labelCls}>Vendedor responsável</span>
        <select
          value={lead.seller?.id || ""}
          onChange={(e) => onPatch({ sellerId: e.target.value || null })}
          className={inputCls}
        >
          <option value="">Sem vendedor (IA atende)</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div>
          <span className={labelCls}>Etiquetas</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = leadTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => onPatch(active ? { removeTagId: tag.id } : { addTagId: tag.id })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                    TAG_COLOR_CLASSES[tag.color] || TAG_COLOR_CLASSES.gray
                  } ${active ? "opacity-100 ring-1 ring-current/30" : "opacity-40 hover:opacity-80"}`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <span className={labelCls}>Anotações</span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (lead.note || "") && onPatch({ note })}
          placeholder="Observações internas (o cliente não vê)"
          className={inputCls}
        />
      </div>
      </fieldset>
    </div>
  );
}
