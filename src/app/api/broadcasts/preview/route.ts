export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireUser } from "@/lib/auth/server";
import { normalizeFilters } from "@/lib/broadcast/common";
import { broadcastAudience } from "@/lib/broadcast/shared";

/** Quantos leads o disparo alcança com estes filtros (e alguns nomes de exemplo) */
export async function POST(req: NextRequest) {
  const auth = await requireUser("disparos");
  if (auth.error) return auth.error;
  const body = await req.json();
  const list = await broadcastAudience(db, auth.accountId, normalizeFilters(body.filters));
  return NextResponse.json({
    count: list.length,
    sample: list.slice(0, 8).map((l) => ({ name: l.name, city: l.city, phone: l.phoneJid.split("@")[0] })),
  });
}
