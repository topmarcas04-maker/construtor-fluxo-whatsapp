"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Marca este item como ativo também quando a rota atual começa com este prefixo */
  matchPrefix?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/sdr/leads", label: "SDR", icon: "💬", matchPrefix: "/sdr" },
];

const LEGACY_NAV_ITEMS: NavItem[] = [
  { href: "/flows", label: "Fluxos (legado)", icon: "🔀", matchPrefix: "/flows" },
  { href: "/builder", label: "Builder visual (legado)", icon: "🧩", matchPrefix: "/builder" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
    return pathname === item.href;
  };

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-[color:var(--sidebar-bg)] text-slate-200">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)] text-base">
          🤖
        </span>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">
            Fluxo WhatsApp
          </p>
          <p className="text-[11px] text-slate-400 leading-tight">Resplen Motors</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[color:var(--sidebar-active)] text-white font-medium"
                  : "text-slate-300 hover:bg-[color:var(--sidebar-active)]/60 hover:text-white"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Legado
        </p>
        {LEGACY_NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                active
                  ? "bg-[color:var(--sidebar-active)] text-white font-medium"
                  : "text-slate-400 hover:bg-[color:var(--sidebar-active)]/60 hover:text-white"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-slate-400">
        Construtor de Fluxo WhatsApp
      </div>
    </aside>
  );
}
