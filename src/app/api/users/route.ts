export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUsers } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { userValues, publicUserColumns } from "./shared";

export async function GET() {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const all = await db.query.appUsers.findMany({
    columns: publicUserColumns,
    with: { seller: true, partner: { columns: { id: true, name: true } } },
    orderBy: (u, { asc }) => asc(u.name),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("permissoes");
  if (auth.error) return auth.error;
  const parsed = userValues(await req.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.values.role === "MASTER" && auth.user.role !== "MASTER") {
    return NextResponse.json({ error: "Só o Master pode criar outro Master" }, { status: 403 });
  }
  const exists = await db.query.appUsers.findFirst({ where: eq(appUsers.email, parsed.values.email as string) });
  if (exists) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  const [created] = await db
    .insert(appUsers)
    .values(parsed.values as typeof appUsers.$inferInsert)
    .returning({ id: appUsers.id });
  return NextResponse.json(created, { status: 201 });
}
