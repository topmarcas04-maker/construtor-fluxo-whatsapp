"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, Handshake, LogIn, Link2, Copy, Check, Bot } from "lucide-react";
import { MODULES, moduleLabel, modulesAllowedForType, AI_SOURCE_LABEL } from "@/lib/auth/modules";
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

interface Account {
  id: string;
  name: string;
  type: "PARTNER" | "CLIENT";
  slug: string;
  responsible: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  document: string | null;
  commission: number | null;
  notes: string | null;
  modules: string[];
  aiSource: "OWN" | "PARENT" | "NONE";
  hasOwnKey: boolean;
  leadEdit: boolean;
  waState: string | null;
  active: boolean;
  createdAt: string;
  stats: { users: number; children: number; leads: number; admin_email: string | null } | null;
}

type Form = {
  name: string;
  responsible: string;
  email: string;
  phone: string;
  city: string;
  document: string;
  commission: string;
  notes: string;
  active: boolean;
  modules: string[];
  aiSource: "OWN" | "PARENT" | "NONE";
  leadEdit: boolean;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

const AI_TONE: Record<string, "green" | "blue" | "gray"> = { OWN: "green", PARENT: "blue", NONE: "gray" };
const AI_SHORT: Record<string, string> = { OWN: "IA própria", PARENT: "Usa a minha IA", NONE: "Sem IA" };

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
      title={url}
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copiado" : "Copiar link de acesso"}
    </button>
  );
}

export function AccountsScreen() {
  const [data, setData] = useState<{ childType: "PARTNER" | "CLIENT" | null; parentModules: string[]; accounts: Account[] } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, [load]);

  const childType = data?.childType || "PARTNER";
  const isPartners = childType === "PARTNER";
  const labels = isPartners
    ? { title: "Parceiros", one: "parceiro", new: "Novo parceiro", desc: "Empresas parceiras que revendem a plataforma. Cada parceiro tem painel, WhatsApp e IA próprios, e cadastra os próprios clientes." }
    : { title: "Clientes", one: "cliente", new: "Novo cliente", desc: "Seus clientes. Cada cliente tem painel, WhatsApp, leads e agenda próprios. Você escolhe os menus e a IA de cada um." };

  // Menus que posso liberar para este tipo de conta
  const grantable = useMemo(
    () =>
      MODULES.filter(
        (m) => (modulesAllowedForType(childType) as string[]).includes(m.key) && (data?.parentModules || []).includes(m.key)
      ),
    [childType, data]
  );

  const accounts = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = data?.accounts || [];
    if (!q) return list;
    return list.filter((a) =>
      [a.name, a.responsible, a.city, a.email, a.phone, a.document, a.stats?.admin_email].some((v) => v?.toLowerCase().includes(q))
    );
  }, [data, search]);

  const openNew = () => {
    setForm({
      name: "",
      responsible: "",
      email: "",
      phone: "",
      city: "",
      document: "",
      commission: "",
      notes: "",
      active: true,
      modules: grantable.map((m) => m.key),
      aiSource: "PARENT",
      leadEdit: false,
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    setError(null);
    setEditing("new");
  };
  const openEdit = (a: Account) => {
    setForm({
      name: a.name,
      responsible: a.responsible || "",
      email: a.email || "",
      phone: a.phone || "",
      city: a.city || "",
      document: a.document || "",
      commission: a.commission != null ? String(a.commission) : "",
      notes: a.notes || "",
      active: a.active,
      modules: a.modules,
      aiSource: a.aiSource,
      leadEdit: a.leadEdit,
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    setError(null);
    setEditing(a);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = editing === "new";
      const body: Record<string, unknown> = {
        name: form.name,
        responsible: form.responsible,
        email: form.email,
        phone: form.phone,
        city: form.city,
        document: form.document,
        commission: form.commission,
        notes: form.notes,
        active: form.active,
        modules: form.modules,
        aiSource: form.aiSource,
        leadEdit: form.leadEdit,
      };
      if (isNew) body.admin = { name: form.adminName || form.responsible, email: form.adminEmail, password: form.adminPassword };
      const res = await fetch(isNew ? "/api/accounts" : `/api/accounts/${(editing as Account).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const remove = async (a: Account) => {
    const warn = isPartners
      ? `Excluir o parceiro "${a.name}"?\n\nIsso apaga TUDO dele: usuários, WhatsApp, leads, agenda e também todos os clientes dele. Não dá para desfazer.\n\nSe quiser só bloquear o acesso, edite e desative.`
      : `Excluir o cliente "${a.name}"?\n\nIsso apaga usuários, WhatsApp, leads e agenda dele. Não dá para desfazer.\n\nSe quiser só bloquear o acesso, edite e desative.`;
    if (!confirm(warn)) return;
    await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    load();
  };

  const enter = async (a: Account) => {
    await fetch("/api/session/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: a.id }),
    });
    window.location.href = "/";
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    form && setForm({ ...form, [k]: e.target.value });

  if (!data) {
    return (
      <Page>
        <p className="text-sm text-slate-400">Carregando...</p>
      </Page>
    );
  }

  if (!data.childType) {
    return (
      <Page>
        <EmptyState title="Esta conta não cadastra outras contas" />
      </Page>
    );
  }

  const totalLeads = data.accounts.reduce((s, a) => s + (a.stats?.leads || 0), 0);

  return (
    <Page>
      <PageHeader
        title={labels.title}
        description={labels.desc}
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> {labels.new}
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        {[
          { label: labels.title, value: data.accounts.length },
          { label: "Ativos", value: data.accounts.filter((a) => a.active).length },
          { label: "Com IA própria", value: data.accounts.filter((a) => a.aiSource === "OWN").length },
          { label: isPartners ? "Leads (com os clientes)" : "Leads no total", value: totalLeads },
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

        {accounts.length === 0 ? (
          <div className="flex flex-col items-center">
            <Handshake className="mt-10 text-slate-300" size={40} />
            <EmptyState
              title={data.accounts.length === 0 ? `Nenhum ${labels.one} cadastrado` : "Nada encontrado"}
              text={data.accounts.length === 0 ? `Clique em “${labels.new}” para começar.` : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{isPartners ? "Parceiro" : "Cliente"}</th>
                  <th className="px-5 py-3">Contato</th>
                  <th className="px-5 py-3">Menus liberados</th>
                  <th className="px-5 py-3">IA</th>
                  <th className="px-5 py-3">Números</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{a.name}</p>
                      <p className="text-xs text-slate-400">{[a.document, a.city].filter(Boolean).join(" · ") || "—"}</p>
                      {origin && (
                        <div className="mt-1">
                          <CopyLink url={`${origin}/login?c=${a.slug}`} />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <p>{a.responsible || "—"}</p>
                      <p className="text-xs text-slate-400">{a.stats?.admin_email || a.email || ""}</p>
                      {a.phone && <p className="text-xs text-slate-400">{a.phone}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {MODULES.filter((m) => a.modules.includes(m.key)).map((m) => (
                          <span key={m.key} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            {moduleLabel(m.key, a.type)}
                          </span>
                        ))}
                        {a.modules.length === 0 && <span className="text-xs text-slate-400">Nenhum</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={AI_TONE[a.aiSource]}>{AI_SHORT[a.aiSource]}</Badge>
                      {a.aiSource === "OWN" && !a.hasOwnKey && (
                        <p className="mt-1 text-[11px] text-amber-600">Chave ainda não cadastrada</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      <p>{a.stats?.leads ?? 0} leads{isPartners ? " (c/ clientes)" : ""}</p>
                      <p>{a.stats?.users ?? 0} usuários</p>
                      {isPartners && <p>{a.stats?.children ?? 0} clientes</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        {a.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}
                        {a.waState === "connected" ? (
                          <Badge tone="green">WhatsApp on</Badge>
                        ) : a.waState === "reconnecting" || a.waState === "logged_out" ? (
                          <Badge tone="red">WhatsApp caiu</Badge>
                        ) : (
                          <Badge>Sem WhatsApp</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" onClick={() => enter(a)} title="Entrar no painel desta conta" className="px-3">
                          <LogIn size={15} /> Acessar
                        </Button>
                        <Button variant="ghost" onClick={() => openEdit(a)} title="Editar">
                          <Pencil size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => remove(a)} title="Excluir">
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
        open={editing !== null && form !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? labels.new : `Editar ${labels.one}`}
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
            <section className="grid gap-4 md:grid-cols-2">
              <Field label={`Nome do ${labels.one} *`} className="md:col-span-2">
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
              <Field label="E-mail de contato">
                <Input type="email" value={form.email} onChange={set("email")} />
              </Field>
              <Field label="Cidade">
                <Input value={form.city} onChange={set("city")} />
              </Field>
              {isPartners && (
                <Field label="Comissão (%)">
                  <Input type="number" step="0.1" value={form.commission} onChange={set("commission")} />
                </Field>
              )}
            </section>

            {editing === "new" && (
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
                  <Link2 size={16} /> Acesso ao painel
                </p>
                <p className="mb-3 text-sm text-slate-500">
                  Login do administrador do {labels.one}. Ele poderá criar os próprios usuários depois.
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input placeholder="Nome" value={form.adminName} onChange={set("adminName")} />
                  <Input placeholder="E-mail de login *" type="email" value={form.adminEmail} onChange={set("adminEmail")} />
                  <Input placeholder="Senha (mín. 6) *" type="password" value={form.adminPassword} onChange={set("adminPassword")} />
                </div>
              </section>
            )}

            <section>
              <p className="mb-1 font-semibold text-slate-800">Menus liberados</p>
              <p className="mb-3 text-sm text-slate-500">
                O {labels.one} só vê o que estiver marcado.
                {isPartners && " Ele também só consegue repassar aos clientes dele o que você liberar aqui."} Menus novos
                aparecem nesta lista quando forem criados.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {grantable.map((m) => {
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
                        onChange={() =>
                          setForm({
                            ...form,
                            modules: on ? form.modules.filter((k) => k !== m.key) : [...form.modules, m.key],
                          })
                        }
                        className="accent-[var(--accent)]"
                      />
                      {moduleLabel(m.key, childType)}
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <button className="font-medium text-[var(--accent)]" onClick={() => setForm({ ...form, modules: grantable.map((m) => m.key) })}>
                  Marcar todos
                </button>
                <button className="font-medium text-slate-500" onClick={() => setForm({ ...form, modules: [] })}>
                  Desmarcar todos
                </button>
              </div>
            </section>

            <section>
              <p className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
                <Bot size={16} /> Inteligência artificial
              </p>
              <p className="mb-3 text-sm text-slate-500">De onde vem a IA que atende os leads deste {labels.one}.</p>
              <div className="grid gap-2 md:grid-cols-3">
                {(["PARENT", "OWN", "NONE"] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                      form.aiSource === opt ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <input
                        type="radio"
                        checked={form.aiSource === opt}
                        onChange={() => setForm({ ...form, aiSource: opt })}
                        className="accent-[var(--accent)]"
                      />
                      {AI_SHORT[opt]}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {opt === "PARENT" && "Usa a sua integração de IA (o consumo sai da sua chave)."}
                      {opt === "OWN" && `O ${labels.one} cadastra a própria chave em Configurações → Atendimento IA.`}
                      {opt === "NONE" && "Atendimento só manual, sem IA."}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">{AI_SOURCE_LABEL[form.aiSource]}</p>
            </section>

            {!isPartners && (
              <section className="rounded-xl border border-slate-200 p-4">
                <p className="mb-1 font-semibold text-slate-800">Editar cards dos leads</p>
                <p className="mb-3 text-sm text-slate-500">
                  Se desligado, o cliente vê e conversa com os leads, mas não muda estágio, vendedor, valor, etiquetas nem os
                  dados do card. Você (ou quem acessar pelo botão Acessar) continua podendo editar.
                </p>
                <Toggle
                  checked={form.leadEdit}
                  onChange={(v) => setForm({ ...form, leadEdit: v })}
                  label={form.leadEdit ? "Cliente pode editar os cards" : "Só você edita os cards"}
                />
              </section>
            )}

            <section className="grid gap-4">
              <Field label="Observações">
                <Textarea rows={3} value={form.notes} onChange={set("notes")} />
              </Field>
              <Toggle
                checked={form.active}
                onChange={(v) => setForm({ ...form, active: v })}
                label={form.active ? "Conta ativa" : "Conta desativada (ninguém dela consegue entrar)"}
              />
            </section>
            <ErrorNote message={error} />
          </div>
        )}
      </Modal>
    </Page>
  );
}
