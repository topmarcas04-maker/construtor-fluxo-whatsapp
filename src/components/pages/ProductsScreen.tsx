"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Package, ImagePlus, X, Pencil, Trash2, Bot, Tag, Check } from "lucide-react";
import { Page, PageHeader, Card, Button, Field, Input, Select, Textarea, Toggle, Badge, Modal, EmptyState, ErrorNote } from "@/components/ui";

export interface Category {
  id: string;
  name: string;
  sort: number;
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
  images: { id: string; url: string; label?: string | null }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PriceTag({ p, big }: { p: Pick<Product, "price" | "promoPrice">; big?: boolean }) {
  const size = big ? "text-xl" : "text-base";
  if (p.promoPrice != null) {
    return (
      <div>
        {p.price != null && <p className="text-xs text-slate-400 line-through">{brl(p.price)}</p>}
        <p className={`${size} font-bold text-emerald-600`}>{brl(p.promoPrice)}</p>
      </div>
    );
  }
  if (p.price != null) return <p className={`${size} font-bold text-slate-900`}>{brl(p.price)}</p>;
  return <p className="text-sm font-medium text-slate-500">Preço sob consulta</p>;
}

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
  name: string;
  categoryId: string;
  price: string;
  promoPrice: string;
  code: string;
  description: string;
  active: boolean;
  /** Fotos na ordem: as que já existem têm id; as novas têm dataUrl. label = cor/nome da foto */
  photos: { id?: string; url: string; dataUrl?: string; label: string }[];
};

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
      name: "",
      categoryId: cat !== "all" && cat !== "none" ? cat : "",
      price: "",
      promoPrice: "",
      code: "",
      description: "",
      active: true,
      photos: [],
    });
    setError(null);
    setEditing("new");
  };
  const openEdit = (p: Product) => {
    setViewing(null);
    setForm({
      name: p.name,
      categoryId: p.categoryId || "",
      price: toInput(p.price),
      promoPrice: toInput(p.promoPrice),
      code: p.code || "",
      description: p.description || "",
      active: p.active,
      photos: p.images.map((i) => ({ id: i.id, url: i.url, label: i.label || "" })),
    });
    setError(null);
    setEditing(p);
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
          images: form.photos.map((ph) => (ph.id ? { id: ph.id, label: ph.label } : { dataUrl: ph.dataUrl, label: ph.label })),
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
    const room = 5 - form.photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    const urls = await Promise.all(picked.map(compress));
    setForm({ ...form, photos: [...form.photos, ...urls.map((u) => ({ url: u, dataUrl: u, label: "" }))] });
  };

  const selectedCat = data?.categories.find((c) => c.id === cat);

  return (
    <Page>
      <PageHeader
        title="Produtos"
        description="Monte o catálogo com fotos, preço e descrição. A IA consulta estes produtos para responder e pode enviar as fotos no WhatsApp."
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Novo produto
          </Button>
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
          <Toggle checked={catalogAi} onChange={toggleCatalogAi} label={catalogAi ? "Ligado" : "Desligado"} />
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
        {newCat === null ? (
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
              <button onClick={() => setEditCat({ id: selectedCat.id, name: selectedCat.name })} className="font-medium text-[var(--accent)] hover:underline">Renomear</button>
              <button onClick={() => deleteCategory(selectedCat)} className="font-medium text-red-500 hover:underline">Excluir</button>
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
            <button
              key={p.id}
              onClick={() => setViewing(p)}
              className={`group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${p.active ? "" : "opacity-60"}`}
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
                {!p.active && <span className="absolute right-3 top-3 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-white">Inativo</span>}
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
                      .map((im) => (
                        <span key={im.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {im.label}
                        </span>
                      ))}
                  </div>
                )}
                <PriceTag p={p} />
              </div>
            </button>
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
          viewing && (
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
        {viewing && <ProductDetail p={viewing} category={catName(viewing.categoryId)} />}
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
              <p className="text-sm font-semibold text-slate-800">Fotos (até 5 — a primeira é a principal)</p>
              <p className="mb-2 text-xs text-slate-500">
                Escreva a cor embaixo de cada foto: quando o cliente pedir &quot;me mostra a azul&quot;, a IA manda a foto certa.
              </p>
              <div className="flex flex-wrap gap-3">
                {form.photos.map((ph, i) => (
                  <div key={ph.id || `new-${i}`} className="w-28">
                    <div className="relative h-24 w-28 overflow-hidden rounded-xl border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt="" className="h-full w-full object-cover" />
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
                      placeholder="Cor (ex.: Azul)"
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                ))}
                {form.photos.length < 5 && (
                  <button onClick={() => fileRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    <ImagePlus size={22} /> Adicionar
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Field label="Nome do produto *">
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
              <Field label="Preço (R$)" hint="Vazio = sob consulta">
                <Input inputMode="decimal" placeholder="0,00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Preço promocional (R$)" hint="Opcional">
                <Input inputMode="decimal" placeholder="0,00" value={form.promoPrice} onChange={(e) => setForm({ ...form, promoPrice: e.target.value })} />
              </Field>
              <Field label="Código / referência">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </Field>
            </div>
            <Field label="Descrição" hint="Tudo que a IA pode contar ao cliente: características, medidas, autonomia, garantia, condições de pagamento...">
              <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={form.active ? "Produto ativo (aparece para a IA)" : "Produto inativo (a IA não oferece)"} />
            <ErrorNote message={error} />
          </div>
        )}
      </Modal>
    </Page>
  );
}

export function ProductDetail({ p, category }: { p: Product; category?: string | null }) {
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
        <PriceTag p={p} big />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{p.description || "Sem descrição."}</p>
      </div>
    </div>
  );
}
