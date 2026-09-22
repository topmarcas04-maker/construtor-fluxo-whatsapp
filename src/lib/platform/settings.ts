import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";

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
};

export async function getBranding(): Promise<PlatformBranding> {
  try {
    const row = await db.query.platformSettings.findFirst({
      where: eq(platformSettings.id, "default"),
    });
    if (!row) return DEFAULT_BRANDING;
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
    };
  } catch {
    // Banco indisponível (ex.: durante o build) — usa o visual padrão
    return DEFAULT_BRANDING;
  }
}
