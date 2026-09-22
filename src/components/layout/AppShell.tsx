"use client";

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
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {!expanded && <Sidebar branding={branding} user={user} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {!expanded && <TopBar title={user.account.name} user={user} />}
        <WhatsAppDownBanner user={user} />
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
