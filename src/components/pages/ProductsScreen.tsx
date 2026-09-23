"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Package, ImagePlus, X, Pencil, Trash2, Bot, Tag, Check, Eye, EyeOff, Truck, Clock, CreditCard, Star, Zap } from "lucide-react";
import type { AiAction } from "@/lib/actions/common";
import {
  installmentRows,
  installmentText,
  effectiveAvailability,
  availabilityText,
  kindPriceLabel,
  kindDetails,
  periodSuffix,
  KIND_LABEL,
  type Installment,
} from "@/lib/products/format";
import { Page, PageHeader, Card, Button, Field, Input, Select, Textarea, Toggle, Badge, Modal, EmptyState, ErrorNote } from "@/components/ui";

export interface Category {
  id: string;
  name: string;
  sort: number;
  actionIds?: string[];
  primaryActionId?: string | null;
  funnelId?: string | null;
}

/** Escolha das ações da IA (clique liga/desliga; estrela = principal) */
function ActionPicker({
  actions,
  ids,
  primary,
  onChange,
}: {
  actions: AiAction[];
  ids: string[];
  primary: string | null;
  onChange: (ids: string[], primary: string | null) => void;
}) {
  if (!actions.length) {
    return <p className="text-xs text-slate-500">Nenhuma ação cadastrada. Crie em Configurações → Ações da IA.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const on = ids.includes(a.id);
        const isPrimary = on && primary === a.id;
        return (
          <span
            key={a.id}
            className={`inline-flex items-center overflow-hidden rounded-full border text-sm ${
              on ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-slate-200 text-slate-600"
            } ${a.active ? "" : "opacity-50"}`}
          >
            <button
              type="button"
              onClick={() => {
                const next = on ? ids.filter((x) => x !== a.id) : [...ids, a.id];
                const p = next.includes(primary || "") ? primary : next[0] || null;
                onChange(next, p);
              }}
              className="px-3 py-1.5 font-medium"
              title={a.active ? undefined : "Ação desligada em Configurações"}
            >
              {on && <Check size={13} className="mr-1 inline" />}
              {a.name}
            </button>
            {on && (
              <button
                type="button"
                onClick={() => onChange(ids, a.id)}
                className={`border-l border-[var(--accent)]/30 px-2 py-1.5 ${isPrimary ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                title={isPrimary ? "Ação principal (a IA oferece primeiro)" : "Tornar principal"}
              >
                <Star size={14} fill={isPrimary ? "currentColor" : "none"} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number | null;
  promoPrice: number | null;
  code: string | null;
  active: boolean;
  kind?: string;
  billingPeriod?: string;
  setupFee?: number | null;
  commitmentMonths?: number | null;
  trialDays?: number | null;
  durationMinutes?: number | null;
  availability?: string;
  leadTimeDays?: number | null;
  installments?: Installment[];
  actionIds?: string[];
  primaryActionId?: string | null;
  images: {
    id: string;
    url: string;
    label?: string | null;
    active?: boolean;
    availability?: string | null;
    leadTimeDays?: number | null;
  }[];
}

/** Selo "Pronta entrega" / "Reserva · 15 dias" */
export function DeliveryBadge({ a, small }: { a: { availability: string; days: number | null }; small?: boolean }) {
  const ready = a.availability === "READY";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"} ${
        ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {ready ? <Truck size={small ? 11 : 12} /> : <Clock size={small ? 11 : 12} />}
      {ready ? "Pronta entrega" : a.days ? `Reserva · ${a.days} dias` : "Reserva"}
    </span>
  );
}

/** Igual a MAX_PRODUCT_IMAGES em lib/products/server.ts */
const MAX_PHOTOS = 8;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PriceTag({
  p,
  big,
}: {
  p: Pick<Product, "price" | "promoPrice"> & { kind?: string; billingPeriod?: string };
  big?: boolean;
}) {
  const size = big ? "text-xl" : "text-base";
  const suffix = periodSuffix(p);
  const per = suffix ? <span className="text-sm font-medium text-slate-500">{suffix}</span> : null;
  if (p.promoPrice != null) {
    return (
      <div>
        {p.price != null && <p className="text-xs text-slate-400 line-through">{brl(p.price)}{suffix}</p>}
        <p className={`${size} font-bold text-emerald-600`}>
          {brl(p.promoPrice)}
          {per}
        </p>
      </div>
    );
  }
  if (p.price != null)
    return (
      <p className={`${size} font-bold text-slate-900`}>
        {brl(p.price)}
        {per}
      </p>
    );
  return <p className="text-sm font-medium text-slate-500">{p.kind === "SERVICE" ? "Sob orçamento" : "Preço sob consulta"}</p>;
}

const KIND_BADGE: Record<string, string> = {
  PHYSICAL: "bg-slate-100 text-slate-600",
  PLAN: "bg-violet-50 text-violet-700",
  SERVICE: "bg-sky-50 text-sky-700",
};

/** Reduz a foto para até 1200px (JPEG) antes de salvar */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Form = {
  actionIds: string[];
  primaryActionId: string | null;
  kind: "PHYSICAL" | "PLAN" | "SERVICE";
  billingPeriod: "MONTH" | "YEAR";
  setupFee: string;
  commitmentMonths: string;
  trialDays: string;
  durationMinutes: string;
  name: string;
  categoryId: string;
  price: string;
  promoPrice: string;
  code: string;
  description: string;
  active: boolean;
  availability: "READY" | "ORDER";
  leadTimeDays: string;
  /** 3 opções de parcelamento: parcelas e total a prazo */
  installments: { n: string; total: string }[];
  /** Fotos na ordem: as que já existem têm id; as novas têm dataUrl. label = cor/nome da foto */
  photos: {
    id?: string;
    url: string;
    dataUrl?: string;
    label: string;
    active: boolean;
    /** "" = igual ao produto */
    availability: "" | "READY" | "ORDER";
    leadTimeDays: string;
  }[];
};

const EMPTY_INSTALLMENTS = [
  { n: "", total: "" },
  { n: "", total: "" },
  { n: "", total: "" },
];

/** "1.234,56" → 1234.56 */
function parseMoney(v: string) {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const toInput = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export function ProductsScreen() {
  const [data, setData] = useState<{ categories: Category[]; products: Product[] } | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<{ id: string; name: string } | null>(null);
  const [catalogAi, setCatalogAi] = useState<boolean | null>(null);
  /** Pode cadastrar/editar (senão, só visualiza) */
  const [canEdit, setCanEdit] = useState(false);
  const [actions, setActions] = useState<AiAction[]>([]);
  const [catActions, setCatActions] = useState<{ cat: Category; ids: string[]; primary: string | null; funnelId: string } | null>(null);
  const [funnelList, setFunnelList] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    load();
    fetch("/api/products/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setCatalogAi(s.catalogEnabled));
    fetch("/api/sdr/funnels")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFunnelList);
    fetch("/api/sdr/actions")
      .then((r) => (r.ok ? r.json() : []))
      .then(setActions);
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCanEdit(Boolean(u?.canEditProducts)));
  }, [load]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products || []).filter(
      (p) =>
        (cat === "all" || (cat === "none" ? !p.categoryId : p.categoryId === cat)) &&
        (!q || [p.name, p.code, p.description].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [data, cat, search]);

  const catName = (id: string | null) => data?.categories.find((c) => c.id === id)?.name;

  const openNew = () => {
    setForm({
      actionIds: [],
      primaryActionId: null,
      kind: "PHYSICAL",
      billingPeriod: "MONTH",
      setupFee: "",
      commitmentMonths: "",
      trialDays: "",
      durationMinutes: "",
      name: "",
      categoryId: cat !== "all" && cat !== "none" ? cat : "",
      price: "",
      promoPrice: "",
      code: "",
      description: "",
      active: true,
      availability: "READY",
      leadTimeDays: "",
      installments: EMPTY_INSTALLMENTS.map((x) => ({ ...x })),
      photos: [],
    });
    setError(null);
    setEditing("new");
  };
  const openEdit = (p: Product) => {
    setViewing(null);
    setForm({
      actionIds: p.actionIds || [],
      primaryActionId: p.primaryActionId || null,
      kind: p.kind === "PLAN" || p.kind === "SERVICE" ? p.kind : "PHYSICAL",
      billingPeriod: p.billingPeriod === "YEAR" ? "YEAR" : "MONTH",
      setupFee: toInput(p.setupFee ?? null),
      commitmentMonths: p.commitmentMonths ? String(p.commitmentMonths) : "",
      trialDays: p.trialDays ? String(p.trialDays) : "",
      durationMinutes: p.durationMinutes ? String(p.durationMinutes) : "",
      name: p.name,
      categoryId: p.categoryId || "",
      price: toInput(p.price),
      promoPrice: toInput(p.promoPrice),
      code: p.code || "",
      description: p.description || "",
      active: p.active,
      availability: p.availability === "ORDER" ? "ORDER" : "READY",
      leadTimeDays: p.leadTimeDays != null ? String(p.leadTimeDays) : "",
      installments: [0, 1, 2].map((k) => {
        const it = p.installments?.[k];
        return it ? { n: String(it.n), total: toInput(it.total) } : { n: "", total: "" };
      }),
      photos: p.images.map((i) => ({
        id: i.id,
        url: i.url,
        label: i.label || "",
        active: i.active !== false,
        availability: i.availability === "READY" || i.availability === "ORDER" ? i.availability : "",
        leadTimeDays: i.leadTimeDays != null ? String(i.leadTimeDays) : "",
      })),
    });
    setError(null);
    setEditing(p);
  };

  /** Liga/desliga o produto direto no card */
  const toggleActive = async (p: Product) => {
    setData((d) => d && { ...d, products: d.products.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)) });
    const r = await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    if (!r.ok) load();
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/products" : `/api/products/${(editing as Product).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          categoryId: form.categoryId || null,
          price: form.price,
          promoPrice: form.promoPrice,
          code: form.code,
          description: form.description,
          active: form.active,
          actionIds: form.actionIds,
          primaryActionId: form.primaryActionId,
          kind: form.kind,
          billingPeriod: form.billingPeriod,
          setupFee: form.kind === "PLAN" ? form.setupFee : null,
          commitmentMonths: form.kind === "PLAN" ? form.commitmentMonths : null,
          trialDays: form.kind === "PLAN" ? form.trialDays : null,
          durationMinutes: form.kind === "SERVICE" ? form.durationMinutes : null,
          availability: form.availability,
          leadTimeDays: form.availability === "ORDER" ? form.leadTimeDays : null,
          installments: form.installments
            .filter((it) => it.n.trim())
            .map((it) => ({ n: Number(it.n), total: it.total.trim() ? it.total : null })),
          images: form.photos.map((ph) => {
            const extra = {
              label: ph.label,
              active: ph.active,
              availability: ph.availability || null,
              leadTimeDays: ph.availability === "ORDER" ? ph.leadTimeDays : null,
            };
            return ph.id ? { id: ph.id, ...extra } : { dataUrl: ph.dataUrl, ...extra };
          }),
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Falha ao salvar");
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir o produto "${p.name}"?`)) return;
    await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    setViewing(null);
    load();
  };

  const addCategory = async () => {
    if (!newCat?.trim()) return setNewCat(null);
    const r = await fetch("/api/products/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCat }),
    });
    const c = await r.json();
    setNewCat(null);
    await load();
    if (r.ok) setCat(c.id);
  };

  const renameCategory = async () => {
    if (!editCat) return;
    await fetch(`/api/products/categories/${editCat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editCat.name }),
    });
    setEditCat(null);
    load();
  };

  const deleteCategory = async (c: Category) => {
    if (!confirm(`Excluir a categoria "${c.name}"? Os produtos dela ficam sem categoria.`)) return;
    await fetch(`/api/products/categories/${c.id}`, { method: "DELETE" });
    setCat("all");
    load();
  };

  const toggleCatalogAi = async (v: boolean) => {
    setCatalogAi(v);
    await fetch("/api/products/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogEnabled: v }),
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !form) return;
    const room = MAX_PHOTOS - form.photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    const urls = await Promise.all(picked.map(compress));
    setForm({
      ...form,
      photos: [
        ...form.photos,
        ...urls.map((u) => ({ url: u, dataUrl: u, label: "", active: true, availability: "" as const, leadTimeDays: "" })),
      ],
    });
  };

  const selectedCat = data?.categories.find((c) => c.id === cat);

  return (
    <Page>
      <PageHeader
        title="Produtos"
        description="Monte o catálogo com fotos, preço e descrição. A IA consulta estes produtos para responder e pode enviar as fotos no WhatsApp."
        actions={
          canEdit ? (
            <Button onClick={openNew}>
              <Plus size={16} /> Novo produto
            </Button>
          ) : (
            <Badge>Somente visualização</Badge>
          )
        }
      />

      {catalogAi !== null && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 border-violet-100 bg-violet-50/50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
              <Bot size={20} />
            </span>
            <div>
              <p className="font-semibold text-slate-900">IA usa o catálogo</p>
              <p className="text-sm text-slate-600">
                Quando o cliente perguntar, a IA informa preço e descrição e envia a foto do produto. Produtos inativos não aparecem.
              </p>
            </div>
          </div>
          {canEdit ? (
            <Toggle checked={catalogAi} onChange={toggleCatalogAi} label={catalogAi ? "Ligado" : "Desligado"} />
          ) : (
            <Badge tone={catalogAi ? "green" : "gray"}>{catalogAi ? "Ligado" : "Desligado"}</Badge>
          )}
        </Card>
      )}

      {/* Categorias */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ id: "all", name: "Todos" }, ...(data?.categories || []), ...((data?.products || []).some((p) => !p.categoryId) ? [{ id: "none", name: "Sem categoria" }] : [])].map(
          (c) => {
            const count =
              c.id === "all"
                ? data?.products.length || 0
                : (data?.products || []).filter((p) => (c.id === "none" ? !p.categoryId : p.categoryId === c.id)).length;
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  cat === c.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {c.name} <span className="opacity-70">({count})</span>
              </button>
            );
          }
        )}
        {!canEdit ? null : newCat === null ? (
          <button onClick={() => setNewCat("")} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <Plus size={14} /> Categoria
          </button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="Nome da categoria"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <Button className="rounded-full px-3 py-1.5" onClick={addCategory}>
              <Check size={14} />
            </Button>
            <Button variant="ghost" className="rounded-full px-2 py-1.5" onClick={() => setNewCat(null)}>
              <X size={14} />
            </Button>
          </span>
        )}
        <div className="relative ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {selectedCat && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Tag size={14} />
          {editCat?.id === selectedCat.id ? (
            <>
              <input
                autoFocus
                value={editCat.name}
                onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && renameCategory()}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button onClick={renameCategory} className="font-medium text-[var(--accent)]">Salvar</button>
            </>
          ) : (
            <>
              <span>Categoria: <b className="text-slate-700">{selectedCat.name}</b></span>
              {canEdit && (
                <>
                  <button onClick={() => setEditCat({ id: selectedCat.id, name: selectedCat.name })} className="font-medium text-[var(--accent)] hover:underline">Renomear</button>
                  <button onClick={() => deleteCategory(selectedCat)} className="font-medium text-red-500 hover:underline">Excluir</button>
                  <button
                    onClick={() =>
                      setCatActions({
                        cat: selectedCat,
                        ids: selectedCat.actionIds || [],
                        primary: selectedCat.primaryActionId || null,
                        funnelId: selectedCat.funnelId || "",
                      })
                    }
                    className="inline-flex items-center gap-1 font-medium text-violet-600 hover:underline"
                  >
                    <Zap size={13} /> Ações e funil
                    {selectedCat.actionIds?.length ? ` (${selectedCat.actionIds.length})` : ""}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Cards */}
      {!data ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : list.length === 0 ? (
        <Card className="flex flex-col items-center py-6">
          <Package className="mt-6 text-slate-300" size={40} />
          <EmptyState
            title={data.products.length === 0 ? "Nenhum produto cadastrado" : "Nada nesta categoria"}
            text={data.products.length === 0 ? "Crie uma categoria (ex.: Scooters, Acessórios) e depois clique em “Novo produto”." : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewing(p)}
              onKeyDown={(e) => e.key === "Enter" && setViewing(p)}
              className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${p.active ? "" : "opacity-60"}`}
            >
              <div className="relative aspect-[4/3] w-full bg-slate-100">
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0].url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <Package size={40} />
                  </div>
                )}
                {p.promoPrice != null && (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">Promoção</span>
                )}
                <button
                  disabled={!canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canEdit) toggleActive(p);
                  }}
                  title={!canEdit ? undefined : p.active ? "Desligar (a IA deixa de oferecer)" : "Ligar (a IA volta a oferecer)"}
                  className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow ${
                    p.active ? "bg-white/95 text-emerald-700" : "bg-slate-800/85 text-white"
                  }`}
                >
                  <span className={`relative h-4 w-7 rounded-full transition ${p.active ? "bg-emerald-500" : "bg-slate-400"}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${p.active ? "left-[14px]" : "left-0.5"}`} />
                  </span>
                  {p.active ? "Ativo" : "Desligado"}
                </button>
                {p.images.length > 1 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{p.images.length} fotos</span>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div>
                  {catName(p.categoryId) && <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">{catName(p.categoryId)}</p>}
                  <p className="line-clamp-1 font-semibold text-slate-900">{p.name}</p>
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                {p.images.some((im) => im.label) && (
                  <div className="flex flex-wrap gap-1">
                    {p.images
                      .filter((im) => im.label)
                      .map((im) => {
                        const a = effectiveAvailability(p, im);
                        return (
                          <span
                            key={im.id}
                            title={im.active === false ? "Cor desligada" : availabilityText(a)}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              im.active === false
                                ? "bg-slate-50 text-slate-400 line-through"
                                : a.availability === "ORDER"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {im.label}
                            {im.active !== false && a.availability === "ORDER" && a.days ? ` · ${a.days}d` : ""}
                          </span>
                        );
                      })}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {p.kind && p.kind !== "PHYSICAL" && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_BADGE[p.kind]}`}>{KIND_LABEL[p.kind]}</span>
                  )}
                  {(!p.kind || p.kind === "PHYSICAL") && <DeliveryBadge a={effectiveAvailability(p)} small />}
                </div>
                <PriceTag p={p} />
                {p.kind && p.kind !== "PHYSICAL" && kindDetails(p).length > 0 && (
                  <p className="text-xs text-slate-500">{kindDetails(p).join(" · ")}</p>
                )}
                {(!p.kind || p.kind === "PHYSICAL") && installmentRows(p).length > 0 && (
                  <p className="text-xs text-slate-500">
                    ou {installmentText(installmentRows(p)[installmentRows(p).length - 1])}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ver produto */}
      <Modal
        wide
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name || ""}
        footer={
          viewing &&
          canEdit && (
            <>
              <Button variant="danger" className="mr-auto" onClick={() => remove(viewing)}>
                <Trash2 size={15} /> Excluir
              </Button>
              <Button onClick={() => openEdit(viewing)}>
                <Pencil size={15} /> Editar
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <ProductDetail
            p={viewing}
            category={catName(viewing.categoryId)}
            actionNames={(() => {
              const own = (viewing.actionIds || []).length > 0;
              const cat = data?.categories.find((c) => c.id === viewing.categoryId);
              const ids = own ? viewing.actionIds! : cat?.actionIds || [];
              const primary = own ? viewing.primaryActionId : cat?.primaryActionId;
              return ids
                .map((id) => actions.find((a) => a.id === id))
                .filter((a): a is AiAction => Boolean(a))
                .sort((a, b) => (a.id === primary ? -1 : b.id === primary ? 1 : 0))
                .map((a) => a.name + (a.id === primary ? " ★" : "") + (own ? "" : " (da categoria)"));
            })()}
          />
        )}
      </Modal>

      {/* Editar/criar */}
      <Modal
        wide
        open={editing !== null && form !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Novo produto" : "Editar produto"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Fotos (até {MAX_PHOTOS} — a primeira é a principal)</p>
              <p className="mb-2 text-xs text-slate-500">
                Escreva a cor embaixo de cada foto: quando o cliente pedir &quot;me mostra a azul&quot;, a IA manda a foto certa. Use o
                olho para desligar uma cor (a IA deixa de oferecer) e a entrega para uma cor com prazo diferente.
              </p>
              <div className="flex flex-wrap gap-3">
                {form.photos.map((ph, i) => (
                  <div key={ph.id || `new-${i}`} className="w-36">
                    <div className={`relative h-24 w-36 overflow-hidden rounded-xl border border-slate-200 ${ph.active ? "" : "opacity-40"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() =>
                          setForm({ ...form, photos: form.photos.map((x, j) => (j === i ? { ...x, active: !x.active } : x)) })
                        }
                        className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white"
                        title={ph.active ? "Desligar esta cor" : "Ligar esta cor"}
                      >
                        {ph.active ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">Principal</span>}
                      <button
                        onClick={() => setForm({ ...form, photos: form.photos.filter((_, j) => j !== i) })}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                        aria-label="Remover foto"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <input
                      value={ph.label}
                      maxLength={60}
                      onChange={(e) =>
                        setForm({ ...form, photos: form.photos.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                      }
                      placeholder={form.kind === "PHYSICAL" ? "Cor (ex.: Azul)" : "Nome da foto"}
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                    />
                    {form.kind === "PHYSICAL" && (
                    <select
                      value={ph.availability}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          photos: form.photos.map((x, j) =>
                            j === i ? { ...x, availability: e.target.value as "" | "READY" | "ORDER" } : x
                          ),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600"
                      title="Entrega desta cor"
                    >
                      <option value="">Entrega: igual ao produto</option>
                      <option value="READY">Pronta entrega</option>
                      <option value="ORDER">Pedido/reserva</option>
                    </select>
                    )}
                    {form.kind === "PHYSICAL" && ph.availability === "ORDER" && (
                      <input
                        inputMode="numeric"
                        value={ph.leadTimeDays}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            photos: form.photos.map((x, j) => (j === i ? { ...x, leadTimeDays: e.target.value.replace(/\D/g, "") } : x)),
                          })
                        }
                        placeholder="Prazo (dias)"
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                      />
                    )}
                    {!ph.active && <p className="mt-0.5 text-[10px] font-medium text-slate-500">Cor desligada</p>}
                  </div>
                ))}
                {form.photos.length < MAX_PHOTOS && (
                  <button onClick={() => fileRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    <ImagePlus size={22} /> Adicionar
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Tipo</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { v: "PHYSICAL", label: "Produto", hint: "scooter, capacete, peça" },
                    { v: "PLAN", label: "Plano / mensalidade", hint: "cobrança mensal ou anual" },
                    { v: "SERVICE", label: "Serviço", hint: "instalação, revisão, consultoria" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setForm({ ...form, kind: o.v })}
                    className={`rounded-xl border px-4 py-2 text-left ${
                      form.kind === o.v
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`block text-sm font-semibold ${form.kind === o.v ? "text-[var(--accent)]" : "text-slate-800"}`}>{o.label}</span>
                    <span className="block text-xs text-slate-500">{o.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Field label={form.kind === "PLAN" ? "Nome do plano *" : form.kind === "SERVICE" ? "Nome do serviço *" : "Nome do produto *"}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Categoria">
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Sem categoria</option>
                  {data?.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label={form.kind === "PLAN" ? (form.billingPeriod === "YEAR" ? "Valor por ano (R$)" : "Valor por mês (R$)") : "Preço (R$)"}
                hint={form.kind === "SERVICE" ? "Vazio = sob orçamento" : "Vazio = sob consulta"}
              >
                <Input inputMode="decimal" placeholder="0,00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Preço promocional (R$)" hint="Opcional">
                <Input inputMode="decimal" placeholder="0,00" value={form.promoPrice} onChange={(e) => setForm({ ...form, promoPrice: e.target.value })} />
              </Field>
              <Field label="Código / referência">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </Field>
            </div>
            {form.kind === "PHYSICAL" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Truck size={16} /> Entrega
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: "READY", label: "Pronta entrega" },
                      { v: "ORDER", label: "Pedido / reserva" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setForm({ ...form, availability: o.v })}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.availability === o.v
                          ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.availability === "ORDER" && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    Entrega em até
                    <input
                      inputMode="numeric"
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
                      value={form.leadTimeDays}
                      onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value.replace(/\D/g, "") })}
                      placeholder="15"
                    />
                    dias
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {form.availability === "ORDER"
                    ? "A IA sempre avisa o prazo quando falar deste produto."
                    : "A IA pode destacar que é pronta entrega."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <CreditCard size={16} /> Preço a prazo (cartão)
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  Parcelas e o total a prazo. Deixe o total vazio para parcelar sem juros (pelo preço à vista).
                </p>
                <div className="space-y-2">
                  {form.installments.map((it, k) => {
                    const n = Number(it.n);
                    const cash = parseMoney(form.promoPrice) ?? parseMoney(form.price);
                    const total = it.total.trim() ? parseMoney(it.total) : cash;
                    const each = n >= 2 && total != null && !Number.isNaN(total) ? total / n : null;
                    return (
                      <div key={k} className="flex flex-wrap items-center gap-2">
                        <input
                          inputMode="numeric"
                          className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
                          placeholder={["12", "18", "21"][k]}
                          value={it.n}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              installments: form.installments.map((x, j) => (j === k ? { ...x, n: e.target.value.replace(/\D/g, "").slice(0, 2) } : x)),
                            })
                          }
                        />
                        <span className="text-sm text-slate-500">x</span>
                        <span className="text-xs text-slate-400">total R$</span>
                        <input
                          inputMode="decimal"
                          className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
                          placeholder="sem juros"
                          value={it.total}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              installments: form.installments.map((x, j) => (j === k ? { ...x, total: e.target.value } : x)),
                            })
                          }
                        />
                        <span className="min-w-[120px] text-sm font-semibold text-slate-800">
                          {each != null ? `= ${n}x de ${brl(Math.round(each * 100) / 100)}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            )}

            {form.kind === "PLAN" && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-800">Condições do plano</p>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Cobrança">
                    <Select value={form.billingPeriod} onChange={(e) => setForm({ ...form, billingPeriod: e.target.value === "YEAR" ? "YEAR" : "MONTH" })}>
                      <option value="MONTH">Mensal</option>
                      <option value="YEAR">Anual</option>
                    </Select>
                  </Field>
                  <Field label="Taxa de adesão (R$)" hint="Vazio = sem adesão">
                    <Input inputMode="decimal" placeholder="0,00" value={form.setupFee} onChange={(e) => setForm({ ...form, setupFee: e.target.value })} />
                  </Field>
                  <Field label="Fidelidade (meses)" hint="Vazio = sem fidelidade">
                    <Input inputMode="numeric" placeholder="12" value={form.commitmentMonths} onChange={(e) => setForm({ ...form, commitmentMonths: e.target.value.replace(/\D/g, "") })} />
                  </Field>
                  <Field label="Teste grátis (dias)" hint="Opcional">
                    <Input inputMode="numeric" placeholder="7" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value.replace(/\D/g, "") })} />
                  </Field>
                </div>
              </div>
            )}

            {form.kind === "SERVICE" && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-800">Serviço</p>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  Duração
                  <input
                    inputMode="numeric"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    placeholder="60"
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: e.target.value.replace(/\D/g, "") })}
                  />
                  minutos
                </div>
              </div>
            )}

            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Zap size={15} className="text-violet-600" /> Ações da IA para este {form.kind === "PLAN" ? "plano" : form.kind === "SERVICE" ? "serviço" : "produto"}
              </p>
              <p className="mb-3 text-xs text-slate-500">
                O que a IA conduz quando o cliente se interessa: clique para marcar e use a ★ para a principal (oferecida primeiro).
                {form.categoryId && data?.categories.find((c) => c.id === form.categoryId)?.actionIds?.length
                  ? " Deixe vazio para usar as ações da categoria."
                  : " Deixe vazio para a IA seguir as instruções gerais."}
              </p>
              <ActionPicker
                actions={actions}
                ids={form.actionIds}
                primary={form.primaryActionId}
                onChange={(ids, primary) => setForm({ ...form, actionIds: ids, primaryActionId: primary })}
              />
            </div>

            <Field label="Descrição" hint="Tudo que a IA pode contar ao cliente: características, medidas, autonomia, garantia, condições de pagamento...">
              <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={form.active ? "Produto ativo (aparece para a IA)" : "Produto inativo (a IA não oferece)"} />
            <ErrorNote message={error} />
          </div>
        )}
      </Modal>

      {/* Ações da categoria */}
      <Modal
        title={catActions ? `Categoria ${catActions.cat.name}` : ""}
        open={catActions !== null}
        onClose={() => setCatActions(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatActions(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!catActions) return;
                const r = await fetch(`/api/products/categories/${catActions.cat.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    actionIds: catActions.ids,
                    primaryActionId: catActions.primary,
                    funnelId: catActions.funnelId || null,
                  }),
                });
                if (r.ok) {
                  setCatActions(null);
                  load();
                } else setError((await r.json().catch(() => ({}))).error || "Falha ao salvar");
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        {catActions && (
          <div className="space-y-5">
            {funnelList.length > 1 && (
              <Field label="Funil dos leads" hint="Quando o cliente se interessar por um produto desta categoria, o card vai para este funil.">
                <Select value={catActions.funnelId} onChange={(e) => setCatActions({ ...catActions, funnelId: e.target.value })}>
                  <option value="">Funil principal</option>
                  {funnelList
                    .filter((f) => !f.isDefault)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <p className="text-sm font-medium text-slate-700">Ações da IA</p>
            <p className="-mt-3 text-sm text-slate-600">
              Valem para todos os produtos da categoria <b>{catActions.cat.name}</b> que não tiverem ações próprias.
            </p>
            <ActionPicker
              actions={actions}
              ids={catActions.ids}
              primary={catActions.primary}
              onChange={(ids, primary) => setCatActions({ ...catActions, ids, primary })}
            />
          </div>
        )}
      </Modal>
    </Page>
  );
}

export function ProductDetail({ p, category, actionNames }: { p: Product; category?: string | null; actionNames?: string[] }) {
  const [idx, setIdx] = useState(0);
  const img = p.images[idx];
  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.label || p.name} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300"><Package size={48} /></div>
          )}
        </div>
        {img?.label && <p className="mt-1.5 text-center text-sm font-medium text-slate-600">{img.label}</p>}
        {p.images.length > 1 && (
          <div className="mt-2 flex gap-2">
            {p.images.map((im, i) => (
              <button key={im.id} onClick={() => setIdx(i)} title={im.label || undefined} className={`h-14 w-14 overflow-hidden rounded-lg border-2 ${i === idx ? "border-[var(--accent)]" : "border-transparent"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {category && <Badge tone="blue">{category}</Badge>}
          {p.code && <Badge>Cód. {p.code}</Badge>}
          {!p.active && <Badge tone="red">Inativo</Badge>}
        </div>
        {p.kind && p.kind !== "PHYSICAL" && (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_BADGE[p.kind]}`}>{KIND_LABEL[p.kind]}</span>
        )}
        <PriceTag p={p} big />
        {p.kind && p.kind !== "PHYSICAL" && kindDetails(p).length > 0 && (
          <div className="space-y-0.5 text-sm text-slate-600">
            {kindDetails(p).map((d) => (
              <p key={d}>{d}</p>
            ))}
          </div>
        )}
        {(!p.kind || p.kind === "PHYSICAL") && installmentRows(p).length > 0 && (
          <div className="space-y-0.5 text-sm text-slate-600">
            {installmentRows(p).map((r) => (
              <p key={r.n}>ou {installmentText(r)}</p>
            ))}
          </div>
        )}
        {(!p.kind || p.kind === "PHYSICAL") && <DeliveryBadge a={effectiveAvailability(p, img)} />}
        {img?.label && img.active === false && <Badge tone="red">Cor desligada</Badge>}
        {actionNames && actionNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold text-violet-700">
              <Zap size={12} /> Ações da IA:
            </span>
            {actionNames.map((n) => (
              <span key={n} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                {n}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{p.description || "Sem descrição."}</p>
      </div>
    </div>
  );
}
