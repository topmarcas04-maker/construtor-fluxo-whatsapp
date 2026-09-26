"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  MessageCircle,
  Users,
  CalendarDays,
  Package,
  Settings,
  Handshake,
  ShieldCheck,
  Palette,
  AtSign,
  Workflow,
  Crown,
  Megaphone,
  FolderOpen,
  GraduationCap,
  Video,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { MODULES, moduleLabel, type ModuleKey } from "@/lib/auth/modules";
import type { PlatformBranding } from "@/lib/platform/settings";

const ICONS: Record<ModuleKey, LucideIcon> = {
  "visao-geral": LayoutDashboard,
  whatsapp: MessageCircle,
  "redes-sociais": AtSign,
  leads: Users,
  agentes: Bot,
  agenda: CalendarDays,
  produtos: Package,
  chatbot: Workflow,
  disparos: Megaphone,
  drive: FolderOpen,
  aulas: GraduationCap,
  calls: Video,
  configuracoes: Settings,
  parceiros: Handshake,
  planos: Crown,
  permissoes: ShieldCheck,
  plataforma: Palette,
};

/** Agrupamento visual do menu. Menus novos entram no primeiro grupo automaticamente. */
const ADMIN_KEYS: ModuleKey[] = ["parceiros", "planos", "permissoes", "plataforma"];

export function Sidebar({
  branding,
  user,
  collapsed = false,
  onToggle,
  mobile = false,
  onClose,
}: {
  branding: PlatformBranding;
  user: { modules: string[]; account: { type: string } };
  /** Menu recolhido: mostra só os ícones */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Versão do celular (gaveta que abre por cima) */
  mobile?: boolean;
  onClose?: () => void;
}) {
  const mini = collapsed && !mobile;
  const pathname = usePathname();
  const visible = MODULES.filter((m) => user.modules.includes(m.key));
  const groups = [
    { title: null, items: visible.filter((m) => !ADMIN_KEYS.includes(m.key)) },
    { title: "Administração", items: visible.filter((m) => ADMIN_KEYS.includes(m.key)) },
  ];

  return (
    <aside
      className={`flex h-full shrink-0 flex-col transition-[width] duration-200 ${mini ? "w-[76px]" : "w-64"}`}
      style={{ background: "var(--menu-bg)", color: "var(--menu-text)" }}
    >
      <div className={`flex h-[76px] shrink-0 items-center gap-3 ${mini ? "justify-center px-2" : "px-6"}`}>
        {mini ? (
          branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt={branding.displayName} className="max-h-10 max-w-[48px] object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15" title={branding.displayName}>
              <MessageCircle size={20} />
            </span>
          )
        ) : branding.logo ? (
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
        {mobile && (
          <button onClick={onClose} className="ml-auto rounded-lg p-2 hover:bg-white/10" aria-label="Fechar menu">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className={`flex-1 space-y-5 overflow-y-auto py-4 ${mini ? "px-3" : "px-4"}`}>
        {groups.map((group, gi) =>
          group.items.length === 0 ? null : (
            <div key={gi} className="space-y-1.5">
              {group.title && mini && <div className="mx-2 mb-2 border-t border-white/15" />}
              {group.title && !mini && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider opacity-60">{group.title}</p>
              )}
              {group.items.map((item) => {
                const Icon = ICONS[item.key] || LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={mobile ? onClose : undefined}
                    title={mini ? moduleLabel(item.key, user.account.type) : undefined}
                    className={`flex items-center rounded-xl py-3 text-[15px] font-semibold transition ${
                      mini ? "justify-center px-0" : "gap-3 px-4"
                    } ${active ? "sidebar-active" : "hover:bg-white/10"}`}
                  >
                    <Icon size={20} strokeWidth={1.9} className="shrink-0" />
                    {!mini && moduleLabel(item.key, user.account.type)}
                  </Link>
                );
              })}
            </div>
          )
        )}
      </nav>

      {!mobile && onToggle && (
        <div className={`shrink-0 border-t border-white/10 py-3 ${mini ? "px-3" : "px-4"}`}>
          <button
            onClick={onToggle}
            title={mini ? "Abrir menu" : "Esconder menu"}
            className={`flex w-full items-center rounded-xl py-2.5 text-sm font-medium opacity-80 transition hover:bg-white/10 hover:opacity-100 ${
              mini ? "justify-center" : "gap-3 px-4"
            }`}
          >
            {mini ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            {!mini && "Esconder menu"}
          </button>
        </div>
      )}
    </aside>
  );
}
