export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, appUsers, plans } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { ALL_MODULE_KEYS, type AccountType } from "@/lib/auth/modules";
import { hashPassword } from "@/lib/auth/password";
import { getAccountModules, uniqueSlug } from "@/lib/tenancy/server";
import { accountValues } from "./shared";
import { accountBenefits } from "@/lib/plans/server";

function childTypeOf(type: string): AccountType | null {
  if (type === "MASTER") return "PARTNER";
  if (type === "PARTNER") return "CLIENT";
  return null;
}

/** Contas cadastradas pela conta ativa (parceiros do Master, ou clientes do parceiro) */
export async function GET() {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const rows = await db.query.accounts.findMany({
    where: eq(accounts.parentId, auth.accountId),
    orderBy: (a, { asc }) => asc(a.name),
  });
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? (
        await db.execute(sql`
          SELECT a.id,
            (SELECT count(*)::int FROM app_users u WHERE u.account_id = a.id) AS users,
            (SELECT count(*)::int FROM accounts c WHERE c.parent_id = a.id) AS children,
            (SELECT count(*)::int FROM leads l WHERE l.account_id = a.id
               OR l.account_id IN (SELECT c.id FROM accounts c WHERE c.parent_id = a.id)) AS leads,
            (SELECT u.email FROM app_users u WHERE u.account_id = a.id AND u.role IN ('ADMIN','MASTER')
               ORDER BY u.created_at LIMIT 1) AS admin_email
          FROM accounts a WHERE a.parent_id = ${auth.accountId}
        `)
      ).rows
    : [];
  const byId = new Map((counts as { id: string }[]).map((c) => [c.id, c]));
  return NextResponse.json({
    childType: childTypeOf(auth.user.account.type),
    parentModules: await getAccountModules(await db.query.accounts.findFirst({ where: eq(accounts.id, auth.accountId) }) || null),
    accounts: rows.map((r) => {
      const { aiApiKeyEnc, ...rest } = r;
      return { ...rest, hasOwnKey: Boolean(aiApiKeyEnc), stats: byId.get(r.id) || null };
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const childType = childTypeOf(auth.user.account.type);
  if (!childType) return NextResponse.json({ error: "Esta conta não pode cadastrar outras contas" }, { status: 403 });

  const body = await req.json();
  const parent = await db.query.accounts.findFirst({ where: eq(accounts.id, auth.accountId) });
  const parentModules = await getAccountModules(parent || null);
  const planIds = (await db.select({ id: plans.id }).from(plans).where(eq(plans.accountId, auth.accountId))).map((p) => p.id);
  const parsed = accountValues(body, { partial: false, childType, parentModules, ceiling: parent ? accountBenefits(parent) : undefined, planIds });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = body.admin || {};
  const adminEmail = String(admin.email || "").trim().toLowerCase();
  const adminName = String(admin.name || body.responsible || body.name || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
    return NextResponse.json({ error: "Informe o e-mail de acesso do administrador" }, { status: 400 });
  }
  if (String(admin.password || "").length < 6) {
    return NextResponse.json({ error: "A senha de acesso precisa ter pelo menos 6 caracteres" }, { status: 400 });
  }
  const exists = await db.query.appUsers.findFirst({ where: eq(appUsers.email, adminEmail) });
  if (exists) return NextResponse.json({ error: "Já existe um usuário com esse e-mail de acesso" }, { status: 409 });

  const v = parsed.values;
  const [created] = await db
    .insert(accounts)
    .values({
      ...(v as object),
      parentId: auth.accountId,
      type: childType,
      name: v.name as string,
      slug: await uniqueSlug(v.name as string),
      modules: (v.modules as string[]) ?? parentModules.filter((m) => m !== "parceiros" || childType === "PARTNER"),
      aiSource: (v.aiSource as string) || "PARENT",
    } as typeof accounts.$inferInsert)
    .returning();

  await db.insert(appUsers).values({
    accountId: created.id,
    name: adminName || created.name,
    email: adminEmail,
    passwordHash: hashPassword(String(admin.password)),
    role: "ADMIN",
    permissions: ALL_MODULE_KEYS,
  });

  const { aiApiKeyEnc, ...safe } = created;
  void aiApiKeyEnc;
  return NextResponse.json(safe, { status: 201 });
}
