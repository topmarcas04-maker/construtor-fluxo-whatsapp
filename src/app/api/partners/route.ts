export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { partners } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { partnerValues } from "./shared";

export async function GET() {
  const auth = await requireUser(["parceiros", "permissoes"]);
  if (auth.error) return auth.error;
  const all = await db.query.partners.findMany({
    with: { users: { columns: { id: true, name: true, email: true, active: true } } },
    orderBy: (p, { asc }) => asc(p.name),
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("parceiros");
  if (auth.error) return auth.error;
  const parsed = partnerValues(await req.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [created] = await db.insert(partners).values(parsed.values as typeof partners.$inferInsert).returning();
  return NextResponse.json(created, { status: 201 });
}
