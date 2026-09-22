export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getBrandingBySlug } from "@/lib/platform/settings";

/** Identidade visual para a tela de login (sem autenticação). ?c=slug usa a marca da conta. */
export async function GET(req: NextRequest) {
  const b = await getBrandingBySlug(req.nextUrl.searchParams.get("c"));
  return NextResponse.json({ displayName: b.displayName, subtitle: b.subtitle, logo: b.logo, menuBg: b.menuBg, menuText: b.menuText, accent: b.accent });
}
