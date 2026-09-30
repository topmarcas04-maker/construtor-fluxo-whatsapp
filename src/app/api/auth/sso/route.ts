export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, appUsers, plans } from "@/db/schema";
import { ALL_MODULE_KEYS } from "@/lib/auth/modules";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { ACTING_COOKIE, VIEW_AS_COOKIE } from "@/lib/auth/server";
import { ssoErrorPage, ssoReady, verifySsoToken } from "@/lib/auth/sso";
import { getAccountModules, uniqueSlug } from "@/lib/tenancy/server";

/**
 * GET /api/auth/sso?token=... — entrada pelo RossIA Partners ("Meus sistemas").
 * Primeiro acesso: cria a conta como Parceiro (abaixo do Master), com o plano de mesmo nome, e o login.
 */
export async function GET(req: NextRequest) {
  if (!ssoReady()) return ssoErrorPage("O login automático não está configurado neste sistema (SSO_SECRET).");
  const p = verifySsoToken(req.nextUrl.searchParams.get("token"));
  if (!p || p.typ !== "login") return ssoErrorPage("O link de entrada expirou ou é inválido. Volte ao RossIA Partners e clique em Entrar de novo.");
  if (!p.active) return ssoErrorPage("Seu acesso a este sistema não está liberado.");

  let user = await db.query.appUsers.findFirst({ where: eq(appUsers.email, p.email) });
  const isAdmin = p.sub.startsWith("admin:");

  if (user) {
    const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, user.accountId!) });
    if (!acc) return ssoErrorPage("Conta não encontrada.");
    // Conta ligada ao Partners: o Partners manda na situação (reativa se estava bloqueada)
    if (acc.ssoRef === p.sub && !acc.active) await db.update(accounts).set({ active: true }).where(eq(accounts.id, acc.id));
    else if (!acc.active) return ssoErrorPage("Esta conta está desativada. Fale com a RossIA.");
    if (!acc.ssoRef && !isAdmin && acc.type !== "MASTER") await db.update(accounts).set({ ssoRef: p.sub }).where(eq(accounts.id, acc.id));
    if (!user.active) return ssoErrorPage("Seu usuário está desativado. Fale com o administrador.");
  } else {
    if (isAdmin) return ssoErrorPage(`Não existe usuário com o e-mail ${p.email} neste sistema. Use o mesmo e-mail do seu login Master.`);
    const master = await db.query.accounts.findFirst({ where: eq(accounts.type, "MASTER") });
    if (!master) return ssoErrorPage("O sistema ainda não tem a conta Master.");

    // Conta criada antes pelo Partners (e o usuário foi trocado): reaproveita
    let acc = await db.query.accounts.findFirst({ where: eq(accounts.ssoRef, p.sub) });
    if (!acc) {
      const plan = p.planName
        ? await db.query.plans.findFirst({
            where: and(eq(plans.accountId, master.id), sql`lower(${plans.name}) = lower(${p.planName.trim()})`),
          })
        : null;
      const masterModules = await getAccountModules(master);
      [acc] = await db
        .insert(accounts)
        .values({
          parentId: master.id,
          type: "PARTNER",
          name: (p.name || p.email).slice(0, 200),
          slug: await uniqueSlug(p.name || p.email.split("@")[0]),
          responsible: (p.name || "").slice(0, 150) || null,
          email: p.email,
          phone: (p.phone || "").slice(0, 40) || null,
          city: (p.city || "").slice(0, 120) || null,
          document: (p.document || "").slice(0, 30) || null,
          modules: plan ? (plan.modules as string[]) : masterModules,
          aiSource: "PARENT",
          planId: plan?.id ?? null,
          maxWhatsapp: plan?.maxWhatsapp ?? 1,
          maxAgents: plan?.maxAgents ?? 1,
          callsPerMonth: plan?.callsPerMonth ?? 0,
          supportAccess: plan?.supportAccess ?? false,
          premiumAccess: plan?.premiumAccess ?? false,
          notes: `Criada pelo RossIA Partners${p.planName ? ` (plano ${p.planName})` : ""}.`,
          ssoRef: p.sub,
        } as typeof accounts.$inferInsert)
        .returning();
    } else if (!acc.active) {
      await db.update(accounts).set({ active: true }).where(eq(accounts.id, acc.id));
    }
    [user] = await db
      .insert(appUsers)
      .values({
        accountId: acc.id,
        name: (p.name || p.email).slice(0, 150),
        email: p.email,
        // Senha aleatória: o acesso é pelo Partners (dá para definir uma senha depois em "Minha conta")
        passwordHash: hashPassword(randomBytes(18).toString("base64url")),
        role: "ADMIN",
        permissions: ALL_MODULE_KEYS,
      })
      .returning();
    console.log(`[SSO] conta criada pelo Partners: ${acc.name} (${p.email})`);
  }

  await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, user!.id));
  // Endereço relativo: atrás do Railway o req.url é o endereço interno (localhost:8080)
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user!.id), sessionCookieOptions);
  res.cookies.set(ACTING_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
