"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Building2, Search, Check, Menu } from "lucide-react";
import { roleLabel, ACCOUNT_TYPE_LABEL } from "@/lib/auth/modules";
import type { CurrentUser } from "@/lib/auth/server";

interface TreeAccount {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  active: boolean;
}

async function actAs(accountId: string | null) {
  await fetch("/api/session/act", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
  window.location.href = "/";
}

/** Seletor "visualizar como": Master/Parceiro entram no painel de contas abaixo deles */
function AccountSwitcher({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<TreeAccount[] | null>(null);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (open && !tree) {
      fetch("/api/accounts/tree")
        .then((r) => r.json())
        .then((d) => setTree(d.accounts || []));
    }
  }, [open, tree]);

  // Ordena como árvore: conta → filhos
  const ordered = useMemo(() => {
    if (!tree) return [];
    const byParent = new Map<string | null, TreeAccount[]>();
    for (const a of tree) {
      const k = a.id === user.homeAccount.id ? null : a.parentId;
      byParent.set(k, [...(byParent.get(k) || []), a]);
    }
    const out: (TreeAccount & { depth: number })[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const a of (byParent.get(parent) || []).sort((x, y) => x.name.localeCompare(y.name))) {
        out.push({ ...a, depth });
        walk(a.id, depth + 1);
      }
    };
    walk(null, 0);
    const term = q.trim().toLowerCase();
    return term ? out.filter((a) => a.name.toLowerCase().includes(term)) : out;
  }, [tree, q, user.homeAccount.id]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        title="Visualizar o painel de outra conta"
      >
        <Building2 size={16} />
        <span className="hidden max-w-[180px] truncate sm:inline">{user.account.name}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-lg">
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Visualizar painel de</p>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conta..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!tree && <p className="px-2 py-3 text-sm text-slate-400">Carregando...</p>}
            {ordered.map((a) => (
              <button
                key={a.id}
                onClick={() => actAs(a.id === user.homeAccount.id ? null : a.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                style={{ paddingLeft: 8 + a.depth * 16 }}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${a.active ? "text-slate-800" : "text-slate-400 line-through"}`}>{a.name}</span>
                  <span className="text-[11px] text-slate-400">{ACCOUNT_TYPE_LABEL[a.type] || a.type}</span>
                </span>
                {a.id === user.account.id && <Check size={15} className="text-[var(--accent)]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ title, user, onOpenMenu }: { title: string; user: CurrentUser; onOpenMenu?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = user.homeAccount.type === "MASTER" ? "/login" : `/login?c=${user.homeAccount.slug}`;
  };

  return (
    <>
      {user.actingAs && (
        <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>
            Você está visualizando o painel de <b>{user.account.name}</b> ({ACCOUNT_TYPE_LABEL[user.account.type]}).
          </span>
          <button onClick={() => actAs(null)} className="rounded-md bg-amber-900 px-3 py-1 text-xs font-semibold text-white">
            Voltar para minha conta
          </button>
        </div>
      )}
      <header
        className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 md:h-[76px] md:px-8"
        style={{ background: "var(--top-bg)", color: "var(--top-text)" }}
      >
        <button onClick={onOpenMenu} className="-ml-1 rounded-lg p-2 hover:bg-black/5 md:hidden" aria-label="Abrir menu">
          <Menu size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight">{title}</p>
          <p className="text-sm leading-tight opacity-60">
            {user.actingAs ? `${ACCOUNT_TYPE_LABEL[user.account.type]} · acesso de administrador` : roleLabel(user.role, user.account.type)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          {user.canManage && user.homeAccount.type !== "CLIENT" && <AccountSwitcher user={user} />}
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] font-medium hover:bg-black/5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden md:inline">{user.name}</span>
              <ChevronDown size={16} />
            </button>
            {open && (
              <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-lg">
                <div className="px-3 py-2">
                  <p className="font-semibold text-slate-900">{user.name}</p>
                  <p className="truncate text-sm text-slate-500">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {roleLabel(user.role, user.homeAccount.type)} · {user.homeAccount.name}
                  </p>
                </div>
                <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <LogOut size={15} /> Sair
                </button>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="hidden rounded-lg border border-slate-300 bg-white px-4 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50 md:block"
          >
            Sair
          </button>
        </div>
      </header>
    </>
  );
}
