"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { MODULES, ROLES, roleLabel, moduleLabel, type RoleKey } from "@/lib/auth/modules";
import {
  Page,
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
  Toggle,
  Badge,
  Modal,
  EmptyState,
  ErrorNote,
} from "@/components/ui";

interface User {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  permissions: string[];
  sellerId: string | null;
  active: boolean;
  lastLoginAt: string | null;
  seller: { id: string; name: string } | null;
}

interface Option {
  id: string;
  name: string;
}

type Form = {
  name: string;
  email: string;
  password: string;
  role: RoleKey;
  permissions: string[];
  sellerId: string;
  active: boolean;
};

const EMPTY: Form = {
  name: "",
  email: "",
  password: "",
  role: "SELLER",
  permissions: ["leads", "agenda"],
  sellerId: "",
  active: true,
};

const ROLE_TONE: Record<string, "purple" | "blue" | "green" | "amber"> = {
  MASTER: "purple",
  ADMIN: "blue",
  SELLER: "green",
};

const ROLE_HELP: Record<RoleKey, string> = {
  MASTER: "Dono da plataforma: acesso total, inclusive a todos os parceiros e clientes.",
  ADMIN: "Administra esta conta: vê todos os menus liberados para ela.",
  SELLER: "Atende leads e agenda. Se vinculado a um vendedor, vê só os leads e horários dele.",
};

export function PermissionsScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [sellers, setSellers] = useState<Option[]>([]);
  const [me, setMe] = useState<{ id: string; role: string; modules: string[]; account: { type: string; name: string } } | null>(null);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [u, s, m] = await Promise.all([
      fetch("/api/users").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sdr/sellers").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    ]);
    setUsers(u);
    setSellers(s);
    setMe(m);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setError(null);
    setEditing("new");
  };
  const openEdit = (u: User) => {
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      permissions: u.permissions,
      sellerId: u.sellerId || "",
      active: u.active,
    });
    setError(null);
    setEditing(u);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/users" : `/api/users/${(editing as User).id}`, {
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

  const remove = async (u: User) => {
    if (!confirm(`Excluir o acesso de ${u.name}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  };

  const togglePerm = (key: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));

  const isAdminForm = form.role === "MASTER" || form.role === "ADMIN";
  const accountType = me?.account.type || "MASTER";
  const available = MODULES.filter((m) => (me?.modules || []).includes(m.key));
  const defaultsFor = (role: RoleKey) =>
    role === "SELLER" ? available.filter((m) => ["leads", "agenda"].includes(m.key)).map((m) => m.key) : available.map((m) => m.key);

  return (
    <Page>
      <PageHeader
        title="Permissões"
        description={`Quem acessa o painel${me ? ` de ${me.account.name}` : ""} e o que cada pessoa pode ver.`}
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Novo usuário
          </Button>
        }
      />

      <Card>
        {users.length === 0 ? (
          <EmptyState title="Nenhum usuário" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Usuário</th>
                  <th className="px-5 py-3">Perfil</th>
                  <th className="px-5 py-3">Áreas liberadas</th>
                  <th className="px-5 py-3">Vínculo</th>
                  <th className="px-5 py-3">Último acesso</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">
                        {u.name} {me?.id === u.id && <span className="text-xs font-normal text-slate-400">(você)</span>}
                      </p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={ROLE_TONE[u.role] || "gray"}>{roleLabel(u.role, accountType)}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {u.role === "MASTER" || u.role === "ADMIN" ? (
                        "Todas da conta"
                      ) : u.permissions.length === 0 ? (
                        <span className="text-slate-400">Nenhuma</span>
                      ) : (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {available.filter((m) => u.permissions.includes(m.key)).map((m) => (
                            <span key={m.key} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                              {moduleLabel(m.key, accountType)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {u.seller ? `Vendedor: ${u.seller.name}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "Nunca"}
                    </td>
                    <td className="px-5 py-3.5">
                      {u.active ? <Badge tone="green">Ativo</Badge> : <Badge>Desativado</Badge>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => openEdit(u)} title="Editar">
                          <Pencil size={15} />
                        </Button>
                        {me?.id !== u.id && (
                          <Button variant="ghost" onClick={() => remove(u)} title="Excluir">
                            <Trash2 size={15} className="text-red-500" />
                          </Button>
                        )}
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
        title={editing === "new" ? "Novo usuário" : "Editar usuário"}
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
          <Field label="Nome *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="E-mail (login) *">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field
            label={editing === "new" ? "Senha *" : "Nova senha"}
            hint={editing === "new" ? "Mínimo de 6 caracteres" : "Deixe vazio para manter a senha atual"}
          >
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Perfil" hint={ROLE_HELP[form.role]}>
            <Select
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as RoleKey;
                setForm({ ...form, role, permissions: defaultsFor(role) });
              }}
            >
              {ROLES.filter((r) => r.key !== "MASTER" || (me?.role === "MASTER" && accountType === "MASTER")).map((r) => (
                <option key={r.key} value={r.key}>
                  {roleLabel(r.key, accountType)}
                </option>
              ))}
            </Select>
          </Field>

          {form.role !== "MASTER" && (
            <Field label="Vincular a um vendedor" hint="Vendedor vinculado vê apenas os próprios leads.">
              <Select value={form.sellerId} onChange={(e) => setForm({ ...form, sellerId: e.target.value })}>
                <option value="">Sem vínculo</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="md:col-span-2">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldCheck size={16} /> Áreas liberadas
            </p>
            {isAdminForm ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Administradores acessam todos os menus liberados para esta conta.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {available.map((m) => (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                      form.permissions.includes(m.key)
                        ? "border-[var(--accent)] bg-[var(--accent)]/5 font-medium text-slate-900"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(m.key)}
                      onChange={() => togglePerm(m.key)}
                      className="accent-[var(--accent)]"
                    />
                    {moduleLabel(m.key, accountType)}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <Toggle
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
              label={form.active ? "Acesso ativo" : "Acesso desativado (não consegue entrar)"}
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
