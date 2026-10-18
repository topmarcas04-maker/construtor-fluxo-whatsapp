"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { PlatformBranding } from "@/lib/platform/settings";
import type { CurrentUser } from "@/lib/auth/server";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { FullscreenProvider, useFullscreen } from "./Fullscreen";

/** Faixa vermelha quando o WhatsApp da conta caiu */
function WhatsAppDownBanner({ user }: { user: CurrentUser }) {
  const state = user.account.waState;
  if (!user.account.waEnabled || (state !== "reconnecting" && state !== "logged_out")) return null;
  const canFix = user.modules.includes("whatsapp");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
      <span>
        {state === "logged_out"
          ? "O WhatsApp foi desconectado pelo celular. A IA e os lembretes estão parados."
          : "O WhatsApp está sem conexão. Verifique se o celular da empresa está ligado e com internet."}
      </span>
      {canFix ? (
        <a href="/whatsapp" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700">
          {state === "logged_out" ? "Conectar de novo" : "Ver WhatsApp"}
        </a>
      ) : (
        <span className="text-xs opacity-80">Avise o administrador.</span>
      )}
    </div>
  );
}

/** Faixa vermelha quando a IA parou (sem crédito, chave recusada, fora do ar) */
function AiDownBanner({ user }: { user: CurrentUser }) {
  const [st, setSt] = useState<{ error: string | null; since: string | null; pending: number; maxHours: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sdr/ai-status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && setSt(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user.account.id]);
  // "Ocultar" esconde a faixa por 6 horas neste navegador (ela volta se a IA continuar parada)
  const [hiddenUntil, setHiddenUntil] = useState(0);
  useEffect(() => {
    try {
      setHiddenUntil(Number(localStorage.getItem("ai-banner-hide") || 0));
    } catch {}
  }, []);
  const [open, setOpen] = useState(false);
  if (!st?.error || hiddenUntil > Date.now()) return null;
  const hide = () => {
    const until = Date.now() + 6 * 3600_000;
    setHiddenUntil(until);
    try {
      localStorage.setItem("ai-banner-hide", String(until));
    } catch {}
  };
  const since = st.since
    ? new Date(st.since).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const canFix = user.modules.includes("configuracoes");
  return (
    <div className="flex items-center gap-2 bg-red-600 px-3 py-1 text-xs text-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" title="Ver detalhes">
        <span className={open ? "" : "block truncate"}>
          ⚠️ <b>IA parada</b> — {st.error}
          {since ? ` (desde ${since})` : ""}
          {open
            ? `. ${
                st.pending > 0
                  ? `${st.pending} ${st.pending === 1 ? "cliente esperando" : "clientes esperando"}: são respondidos quando a IA voltar; depois de ${st.maxHours}h vão para a equipe.`
                  : "Os clientes que escreverem serão respondidos quando ela voltar."
              }`
            : ""}
        </span>
      </button>
      {canFix ? (
        <a href="/configuracoes" className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700">
          Ver chave
        </a>
      ) : (
        <span className="hidden shrink-0 text-[11px] opacity-80 sm:inline">Avise o administrador.</span>
      )}
      <button type="button" onClick={hide} aria-label="Ocultar aviso por 6 horas" title="Ocultar por 6 horas" className="shrink-0 rounded px-1.5 text-base leading-none hover:bg-red-700">
        ×
      </button>
    </div>
  );
}

function Frame({
  branding,
  user,
  children,
}: {
  branding: PlatformBranding;
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const { expanded } = useFullscreen();
  const pathname = usePathname();
  // Menu recolhido (só ícones) — lembrado neste navegador
  const [collapsed, setCollapsed] = useState(false);
  // Celular: menu em gaveta
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sdr_menu_collapsed") === "1");
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sdr_menu_collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50">
      {!expanded && (
        <div className="hidden h-full md:block">
          <Sidebar branding={branding} user={user} collapsed={collapsed} onToggle={toggle} />
        </div>
      )}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full shadow-2xl">
            <Sidebar branding={branding} user={user} mobile onClose={() => setMobileOpen(false)} />
          </div>
          <button className="flex-1 bg-black/40" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!expanded && <TopBar title={user.account.name} user={user} onOpenMenu={() => setMobileOpen(true)} />}
        <WhatsAppDownBanner user={user} />
        <AiDownBanner user={user} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({
  branding,
  user,
  children,
}: {
  branding: PlatformBranding;
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const cssVars = {
    "--menu-bg": branding.menuBg,
    "--menu-text": branding.menuText,
    "--menu-active": branding.menuActive,
    "--top-bg": branding.topBg,
    "--top-text": branding.topText,
    "--accent": branding.accent,
  } as React.CSSProperties;

  // Tela de login (ou sessão expirada): sem menu
  if (pathname === "/login" || !user) {
    return <div style={cssVars}>{children}</div>;
  }

  return (
    <div style={cssVars}>
      <FullscreenProvider>
        <Frame branding={branding} user={user}>
          {children}
        </Frame>
      </FullscreenProvider>
    </div>
  );
}
