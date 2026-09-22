"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, Handshake } from "lucide-react";
import {
  Page,
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Toggle,
  Badge,
  Modal,
  EmptyState,
  ErrorNote,
} from "@/components/ui";

interface Partner {
  id: string;
  name: string;
  responsible: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  document: string | null;
  commission: number | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  users: { id: string; name: string; email: string; active: boolean }[];
}

type Form = {
  name: string;
  responsible: string;
  email: string;
  phone: string;
  city: string;
  document: string;
  commission: string;
  active: boolean;
  notes: string;
};

const EMPTY: Form = {
  name: "",
  responsible: "",
  email: "",
  phone: "",
  city: "",
  document: "",
  commission: "",
  active: true,
  notes: "",
};

export function PartnersScreen() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/partners");
    if (res.ok) setPartners(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return partners;
    return partners.filter((p) =>
      [p.name, p.responsible, p.city, p.email, p.phone, p.document].some((v) => v?.toLowerCase().includes(q))
    );
  }, [partners, search]);

  const openNew = () => {
    setForm(EMPTY);
    setError(null);
    setEditing("new");
  };
  const openEdit = (p: Partner) => {
    setForm({
      name: p.name,
      responsible: p.responsible || "",
      email: p.email || "",
      phone: p.phone || "",
      city: p.city || "",
      document: p.document || "",
      commission: p.commission != null ? String(p.commission) : "",
      active: p.active,
      notes: p.notes || "",
    });
    setError(null);
    setEditing(p);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/partners" : `/api/partners/${(editing as Partner).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Partner) => {
    if (!confirm(`Excluir o parceiro ${p.name}? Os acessos ligados a ele continuam existindo, só sem vínculo.`)) return;
    await fetch(`/api/partners/${p.id}`, { method: "DELETE" });
    load();
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const activeCount = partners.filter((p) => p.active).length;

  return (
    <Page>
      <PageHeader
        title="Parceiros"
        description="Empresas e revendedores parceiros. Para dar acesso ao painel, crie um usuário em Permissões e vincule ao parceiro."
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Novo parceiro
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Parceiros", value: partners.length },
          { label: "Ativos", value: activeCount },
          { label: "Com acesso ao painel", value: partners.filter((p) => p.users.length > 0).length },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{k.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, cidade, responsável, CNPJ..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-[15px] outline-none focus:border-[var(--accent)] focus:bg-white"
            />
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-400">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center">
            <Handshake className="mt-10 text-slate-300" size={40} />
            <EmptyState
              title={partners.length === 0 ? "Nenhum parceiro cadastrado" : "Nada encontrado"}
              text={partners.length === 0 ? "Clique em “Novo parceiro” para começar." : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Parceiro</th>
                  <th className="px-5 py-3">Responsável</th>
                  <th className="px-5 py-3">Contato</th>
                  <th className="px-5 py-3">Cidade</th>
                  <th className="px-5 py-3">Comissão</th>
                  <th className="px-5 py-3">Acessos</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.document && <p className="text-xs text-slate-400">{p.document}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{p.responsible || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <p>{p.phone || "—"}</p>
                      {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{p.city || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-600">{p.commission != null ? `${p.commission}%` : "—"}</td>
                    <td className="px-5 py-3.5 text-slate-600">{p.users.length}</td>
                    <td className="px-5 py-3.5">
                      {p.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => openEdit(p)} title="Editar">
                          <Pencil size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => remove(p)} title="Excluir">
                          <Trash2 size={15} className="text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        wide
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Novo parceiro" : "Editar parceiro"}
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
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do parceiro *" className="md:col-span-2">
            <Input value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Responsável">
            <Input value={form.responsible} onChange={set("responsible")} />
          </Field>
          <Field label="CNPJ / CPF">
            <Input value={form.document} onChange={set("document")} />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={set("city")} />
          </Field>
          <Field label="Comissão (%)">
            <Input type="number" step="0.1" value={form.commission} onChange={set("commission")} />
          </Field>
          <Field label="Observações" className="md:col-span-2">
            <Textarea rows={3} value={form.notes} onChange={set("notes")} />
          </Field>
          <div className="md:col-span-2">
            <Toggle
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
              label={form.active ? "Parceiro ativo" : "Parceiro inativo"}
            />
          </div>
        </div>
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </Modal>
    </Page>
  );
}
