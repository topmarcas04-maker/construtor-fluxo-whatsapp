import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, platformSettings } from "@/db/schema";

export interface PlatformBranding {
  displayName: string;
  subtitle: string | null;
  logo: string | null;
  menuBg: string;
  menuText: string;
  menuActive: string;
  topBg: string;
  topText: string;
  accent: string;
  /** Conta de onde veio a identidade (a própria ou uma conta acima) */
  sourceAccountId?: string | null;
}

export const DEFAULT_BRANDING: PlatformBranding = {
  displayName: "SDR WhatsApp",
  subtitle: "Resplen Motors",
  logo: null,
  menuBg: "#155e75",
  menuText: "#ffffff",
  menuActive: "#ffffff",
  topBg: "#ffffff",
  topText: "#0f172a",
  accent: "#155e75",
  sourceAccountId: null,
};

function toBranding(row: typeof platformSettings.$inferSelect): PlatformBranding {
  return {
    displayName: row.displayName,
    subtitle: row.subtitle,
    logo: row.logo,
    menuBg: row.menuBg,
    menuText: row.menuText,
    menuActive: row.menuActive,
    topBg: row.topBg,
    topText: row.topText,
    accent: row.accent,
    sourceAccountId: row.id,
  };
}

/**
 * Identidade visual da conta. Se a conta não personalizou, usa a da conta mãe
 * (cliente → parceiro → master), e por fim o padrão.
 */
export async function getBranding(accountId?: string | null): Promise<PlatformBranding> {
  try {
    let id = accountId || (await db.query.accounts.findFirst({ where: eq(accounts.type, "MASTER") }))?.id;
    for (let i = 0; id && i < 8; i++) {
      const row = await db.query.platformSettings.findFirst({ where: eq(platformSettings.id, id) });
      if (row) return toBranding(row);
      const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
      id = acc?.parentId || undefined;
    }
    return DEFAULT_BRANDING;
  } catch {
    // Banco indisponível (ex.: durante o build) — usa o visual padrão
    return DEFAULT_BRANDING;
  }
}

export async function getBrandingBySlug(slug: string | null | undefined) {
  if (!slug) return getBranding(null);
  try {
    const acc = await db.query.accounts.findFirst({ where: eq(accounts.slug, slug) });
    return getBranding(acc?.id || null);
  } catch {
    return DEFAULT_BRANDING;
  }
}
