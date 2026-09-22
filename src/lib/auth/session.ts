/**
 * Sessão de login: cookie assinado com HMAC (sem dependências externas).
 * Formato do cookie: base64url(JSON {uid, exp}) + "." + assinatura
 *
 * Usado tanto pelo proxy (src/proxy.ts) quanto pelas rotas de API.
 */
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const SESSION_COOKIE = "sdr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 dias

function secret() {
  // AUTH_SECRET é o ideal. Sem ele, deriva de DATABASE_URL (segredo que só o
  // servidor conhece) para o sistema funcionar sem configuração extra.
  const base = process.env.AUTH_SECRET || process.env.DATABASE_URL || "dev-secret";
  return createHash("sha256").update("sdr-session:" + base).digest();
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (!data?.uid || typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
