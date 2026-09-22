"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  CalendarDays,
  Settings,
  Handshake,
  ShieldCheck,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { MODULES, moduleLabel, type ModuleKey } from "@/lib/auth/modules";
import type { PlatformBranding } from "@/lib/platform/settings";

const ICONS: Record<ModuleKey, LucideIcon> = {
  "visao-geral": LayoutDashboard,
  whatsapp: MessageCircle,
  leads: Users,
  agenda: CalendarDays,
  configuracoes: Settings,
  parceiros: Handshake,
  permissoes: ShieldCheck,
  plataforma: Palette,
};

/** Agrupamento visual do menu. Menus novos entram no primeiro grupo automaticamente. */
const ADMIN_KEYS: ModuleKey[] = ["parceiros", "permissoes", "plataforma"];

export function Sidebar({
  branding,
  user,
}: {
  branding: PlatformBranding;
  user: { modules: string[]; account: { type: string } };
}) {
  const pathname = usePathname();
  const visible = MODULES.filter((m) => user.modules.includes(m.key));
  const groups = [
    { title: null, items: visible.filter((m) => !ADMIN_KEYS.includes(m.key)) },
    { title: "Administração", items: visible.filter((m) => ADMIN_KEYS.includes(m.key)) },
  ];

  return (
    <aside
      className="flex h-screen w-64 shrink-0 flex-col"
      style={{ background: "var(--menu-bg)", color: "var(--menu-text)" }}
    >
      <div className="flex h-[76px] items-center gap-3 px-6">
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt={branding.displayName} className="max-h-11 max-w-[190px] object-contain" />
        ) : (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <MessageCircle size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight">{branding.displayName}</p>
              {branding.subtitle && <p className="truncate text-[11px] leading-tight opacity-70">{branding.subtitle}</p>}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {groups.map((group, gi) =>
          group.items.length === 0 ? null : (
            <div key={gi} className="space-y-1.5">
              {group.title && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider opacity-60">{group.title}</p>
              )}
              {group.items.map((item) => {
                const Icon = ICONS[item.key] || LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition ${
                      active ? "sidebar-active" : "hover:bg-white/10"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.9} />
                    {moduleLabel(item.key, user.account.type)}
                  </Link>
                );
              })}
            </div>
          )
        )}
      </nav>
    </aside>
  );
}
