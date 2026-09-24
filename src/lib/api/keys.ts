import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Nova chave: "rsk_" + 36 caracteres. Só é mostrada uma vez. */
export function generateKey() {
  const bytes = randomBytes(36);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  const key = `rsk_${s}`;
  return { key, prefix: key.slice(0, 10), hash: hashKey(key) };
}

/** Limite simples por chave: 120 chamadas por minuto */
const hits = new Map<string, number[]>();
function limited(id: string) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(id, list);
  return list.length > 120;
}

export function apiError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Confere "Authorization: Bearer rsk_..." (ou header x-api-key) e devolve a conta */
export async function requireApiKey(req: NextRequest): Promise<{ accountId: string; keyId: string } | { error: NextResponse }> {
  const auth = req.headers.get("authorization") || "";
  const key = (/^Bearer\s+(\S+)/i.exec(auth)?.[1] || req.headers.get("x-api-key") || "").trim();
  if (!key.startsWith("rsk_")) return { error: apiError(401, "Informe a chave de API no header Authorization: Bearer rsk_...") };
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, hashKey(key)) });
  if (!row) return { error: apiError(401, "Chave de API inválida ou apagada") };
  if (limited(row.id)) return { error: apiError(429, "Muitas chamadas. Limite: 120 por minuto por chave.") };
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  }
  return { accountId: row.accountId, keyId: row.id };
}

/** Telefone → número só com dígitos e DDI 55 (se vier sem) */
export function normalizePhone(v: unknown) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) return null;
  return d.length <= 11 ? `55${d}` : d;
}
