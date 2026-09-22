import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { getBranding } from "@/lib/platform/settings";
import { getCurrentUser } from "@/lib/auth/server";

// Tudo depende do usuário logado e da identidade visual salva no banco
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.displayName,
    description: "SDR com IA para WhatsApp",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [branding, user] = await Promise.all([getBranding(), getCurrentUser()]);
  return (
    <html lang="pt-BR">
      <body>
        <AppShell branding={branding} user={user}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
