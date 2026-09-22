"use client";

import { usePathname } from "next/navigation";
import type { PlatformBranding } from "@/lib/platform/settings";
import type { CurrentUser } from "@/lib/auth/server";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { FullscreenProvider, useFullscreen } from "./Fullscreen";

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
        {!expanded && <TopBar title={branding.displayName} user={user} />}
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
