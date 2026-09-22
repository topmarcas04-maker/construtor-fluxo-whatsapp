export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getBranding } from "@/lib/platform/settings";

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = ["menuBg", "menuText", "menuActive", "topBg", "topText", "accent"] as const;

export async function GET() {
  const auth = await requireUser("plataforma");
  if (auth.error) return auth.error;
  return NextResponse.json(await getBranding());
}

export async function PUT(request: Request) {
  const auth = await requireUser("plataforma");
  if (auth.error) return auth.error;

  const body = await request.json();
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.displayName === "string") {
    const name = body.displayName.trim();
    if (!name) return NextResponse.json({ error: "Informe o nome exibido" }, { status: 400 });
    values.displayName = name.slice(0, 120);
  }
  if (body.subtitle !== undefined) values.subtitle = String(body.subtitle || "").trim().slice(0, 120) || null;
  if (body.logo !== undefined) {
    if (body.logo && (typeof body.logo !== "string" || !body.logo.startsWith("data:image/"))) {
      return NextResponse.json({ error: "Logo inválida" }, { status: 400 });
    }
    if (body.logo && body.logo.length > 500_000) {
      return NextResponse.json({ error: "Logo muito grande (máx. 350 KB)" }, { status: 400 });
    }
    values.logo = body.logo || null;
  }
  for (const f of COLOR_FIELDS) {
    if (body[f] !== undefined) {
      if (!HEX.test(body[f])) return NextResponse.json({ error: `Cor inválida: ${f}` }, { status: 400 });
      values[f] = body[f];
    }
  }

  await db
    .insert(platformSettings)
    .values({ id: "default", ...(values as object) })
    .onConflictDoUpdate({ target: platformSettings.id, set: values });

  return NextResponse.json(await getBranding());
}
