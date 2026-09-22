export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getBranding } from "@/lib/platform/settings";

/** Identidade visual (usada inclusive na tela de login, sem autenticação) */
export async function GET() {
  return NextResponse.json(await getBranding());
}
