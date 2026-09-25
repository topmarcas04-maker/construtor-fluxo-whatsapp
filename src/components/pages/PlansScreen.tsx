"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Crown, Headphones, Check } from "lucide-react";
import { MODULES, moduleLabel } from "@/lib/auth/modules";
import { DEFAULT_BENEFITS, benefitsText, type Plan, type PlanBenefits } from "@/lib/plans/shared";
import { BenefitsFields } from "@/components/plans/BenefitsFields";
import { Page, PageHeader, Card, Button, Field, Input, Textarea, Toggle, Badge, Modal, EmptyState, ErrorNote } from "@/components/ui";

interface Data {
  plans: Plan[];
  childType: "PARTNER" | "CLIENT";
  grantable: string[];
  ceiling: PlanBenefits;
  services: { supportPhone: string; supportHours: string };
}

type Form = Omit<Plan, "id"> & { applyToAccounts: boolean };

const emptyForm = (grantable: string[]): Form => ({
  name: "",
  description: "",
  price: "",
  modules: grantable,
  ...DEFAULT_BENEFITS,
  sort: 0,
  active: true,
  applyToAccounts: true,
});

export function PlansScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [svc, setSvc] = useState({ supportPhone: "", supportHours: "" });
  const [svcSaved, setSvcSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/plans");
    const d = await res.json();
    if (res.ok) {
      setData(d);
      setSvc(d.services);
    } else setError(d.error || "Falha ao carregar");
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const one = data?.childType === "CLIENT" ? "cliente" : "parceiro";

  const openNew = () => {
    if (!data) return;
    setForm({ ...emptyForm(data.grantable), sort: data.plans.length });
    setError(null);
    setEditing("new");
  };
  const openEdit = (p: Plan) => {
    setForm({ ...p, description: p.description || "", price: p.price || "", applyToAccounts: true });
    setError(null);
    setEditing(p);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/plans" : `/api/plans/${(editing as Plan).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const remove = async (p: Plan) => {
    if (!confirm(`Excluir o plano "${p.name}"?\n\nAs contas que estão nele continuam com os menus e benefícios que já têm.`)) return;
    await fetch(`/api/plans/${p.id}`, { method: "DELETE" });
    load();
  };

  const saveSvc = async () => {
    setError(null);
    const res = await fetch("/api/support", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(svc),
    });
    const out = await res.json();
    if (!res.ok) return setError(out.error || "Falha ao salvar");
    setSvcSaved(true);
    setTimeout(() => setSvcSaved(false), 1500);
  };

  if (!data) {
    return (
      <Page>
        <PageHeader title="Planos" />
        {error ? <ErrorNote message={error} /> : <p className="text-slate-500">Carregando...</p>}
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Planos"
        description={`Monte os planos que você vende: menus liberados, números de WhatsApp, calls, suporte e área premium. Depois é só escolher o plano no cadastro do ${one}.`}
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Novo plano
          </Button>
        }
      />

      {data.plans.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum plano ainda" text="Crie, por exemplo, Essencial, Profissional e Premium." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((p) => (
            <Card key={p.id} className={`flex flex-col p-5 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    {p.premiumAccess && <Crown size={17} className="text-amber-500" />}
                    {p.name}
                  </p>
                  {p.price && <p className="text-[15px] font-semibold text-[var(--accent)]">{p.price}</p>}
                </div>
                {!p.active && <Badge>Inativo</Badge>}
              </div>
              {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {benefitsText(p).map((t) => (
                  <Badge key={t} tone="blue">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {MODULES.filter((m) => p.modules.includes(m.key))
                  .map((m) => moduleLabel(m.key, data.childType))
                  .join(" · ") || "Nenhum menu"}
              </p>
              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="secondary" onClick={() => openEdit(p)}>
                  <Pencil size={15} /> Editar
                </Button>
                <Button variant="ghost" onClick={() => remove(p)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 p-5">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <Headphones size={17} /> Seu suporte pelo WhatsApp
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Os {one}s com &quot;Suporte pelo WhatsApp&quot; no plano veem um botão no topo do painel que abre uma conversa com este número.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <Input
            placeholder="WhatsApp com DDD (ex.: 16999998888)"
            value={svc.supportPhone}
            onChange={(e) => setSvc({ ...svc, supportPhone: e.target.value })}
          />
          <Input
            placeholder="Horário (ex.: Segunda a sexta, 9h às 18h)"
            value={svc.supportHours}
            onChange={(e) => setSvc({ ...svc, supportHours: e.target.value })}
          />
          <Button onClick={saveSvc}>{svcSaved ? <><Check size={15} /> Salvo</> : "Salvar"}</Button>
        </div>
      </Card>

      <Modal
        title={editing === "new" ? "Novo plano" : "Editar plano"}
        open={editing !== null && form !== null}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-6">
            <ErrorNote message={error} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do plano *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Profissional" />
              </Field>
              <Field label="Preço" hint="Texto livre, aparece no cartão do plano.">
                <Input value={form.price || ""} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Ex.: R$ 297/mês" />
              </Field>
            </div>
            <Field label="Descrição">
              <Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>

            <section>
              <p className="mb-2 font-semibold text-slate-800">Benefícios</p>
              <BenefitsFields value={form} onChange={(b) => setForm({ ...form, ...b })} ceiling={data.ceiling} />
            </section>

            <section>
              <p className="mb-2 font-semibold text-slate-800">Menus liberados</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODULES.filter((m) => data.grantable.includes(m.key)).map((m) => {
                  const on = form.modules.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                        on ? "border-[var(--accent)] bg-[var(--accent)]/5 font-medium text-slate-900" : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setForm({ ...form, modules: on ? form.modules.filter((k) => k !== m.key) : [...form.modules, m.key] })}
                        className="accent-[var(--accent)]"
                      />
                      {moduleLabel(m.key, data.childType)}
                    </label>
                  );
                })}
              </div>
            </section>

            <div className="flex flex-wrap gap-6">
              <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={form.active ? "Plano ativo" : "Plano inativo"} />
              {editing !== "new" && (
                <Toggle
                  checked={form.applyToAccounts}
                  onChange={(v) => setForm({ ...form, applyToAccounts: v })}
                  label={`Atualizar os ${one}s que já estão neste plano`}
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
