export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { getBranding } from "@/lib/platform/settings";

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = ["menuBg", "menuText", "menuActive", "topBg", "topText", "accent"] as const;

export async function GET() {
  const auth = await requireUser("plataforma");
  if (auth.error) return auth.error;
  const b = await getBranding(auth.accountId);
  return NextResponse.json({ ...b, inherited: b.sourceAccountId !== auth.accountId });
}

export async function PUT(request: Request) {
  const auth = await requireUser("plataforma");
  if (auth.error) return auth.error;

  const body = await request.json();
  const current = await getBranding(auth.accountId);
  const values: Record<string, unknown> = { updatedAt: new Date() };

  const name = typeof body.displayName === "string" ? body.displayName.trim() : current.displayName;
  if (!name) return NextResponse.json({ error: "Informe o nome exibido" }, { status: 400 });
  values.displayName = name.slice(0, 120);
  values.subtitle =
    body.subtitle !== undefined ? String(body.subtitle || "").trim().slice(0, 120) || null : current.subtitle;

  const logo = body.logo !== undefined ? body.logo : current.logo;
  if (logo && (typeof logo !== "string" || !logo.startsWith("data:image/"))) {
    return NextResponse.json({ error: "Logo inválida" }, { status: 400 });
  }
  if (logo && logo.length > 500_000) {
    return NextResponse.json({ error: "Logo muito grande (máx. 350 KB)" }, { status: 400 });
  }
  values.logo = logo || null;
  for (const f of COLOR_FIELDS) {
    const v = body[f] !== undefined ? body[f] : current[f];
    if (!HEX.test(v)) return NextResponse.json({ error: `Cor inválida: ${f}` }, { status: 400 });
    values[f] = v;
  }

  await db
    .insert(platformSettings)
    .values({ id: auth.accountId, ...(values as object) } as typeof platformSettings.$inferInsert)
    .onConflictDoUpdate({ target: platformSettings.id, set: values });

  const b = await getBranding(auth.accountId);
  return NextResponse.json({ ...b, inherited: false });
}

/** Volta a usar a identidade da conta mãe */
export async function DELETE() {
  const auth = await requireUser("plataforma");
  if (auth.error) return auth.error;
  if (auth.user.account.type === "MASTER") {
    return NextResponse.json({ error: "A conta Master não herda identidade de ninguém" }, { status: 400 });
  }
  await db.delete(platformSettings).where(eq(platformSettings.id, auth.accountId));
  const b = await getBranding(auth.accountId);
  return NextResponse.json({ ...b, inherited: true });
}
