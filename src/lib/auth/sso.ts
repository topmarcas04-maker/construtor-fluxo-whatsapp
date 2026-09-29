/**
 * Login automático vindo do RossIA Partners ("Meus sistemas").
 * O Partners assina o link com HMAC-SHA256 usando SSO_SECRET (o mesmo valor nos dois sistemas).
 * Formato: base64url(JSON) + "." + base64url(assinatura). Vale poucos minutos.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SsoPayload {
  typ: "login" | "status" | "renew";
  /** Id do parceiro no Partners (ou "admin:<id>" quando é o administrador) */
  sub: string;
  email: string;
  name: string;
  phone?: string;
  document?: string;
  city?: string;
  planId?: string | null;
  planName?: string | null;
  active: boolean;
  role?: string;
  exp: number;
}

export function ssoReady() {
  return (process.env.SSO_SECRET || "").length >= 16;
}

export function verifySsoToken(token: string | null | undefined): SsoPayload | null {
  const secret = process.env.SSO_SECRET || "";
  if (secret.length < 16 || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SsoPayload & { iss?: string };
    if (p.iss !== "rossia-partners" || typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    if (!p.sub || !/^\S+@\S+\.\S+$/.test(String(p.email || ""))) return null;
    return { ...p, email: String(p.email).trim().toLowerCase() };
  } catch {
    return null;
  }
}

/** Página simples de erro (o usuário chega aqui pelo navegador) */
export function ssoErrorPage(message: string) {
  const esc = message.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Não foi possível entrar</title></head>
<body style="font-family:system-ui,sans-serif;background:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,.08)">
<h1 style="font-size:18px;margin:0 0 8px;color:#0f172a">Não foi possível entrar</h1>
<p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 18px">${esc}</p>
<a href="/login" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600">Ir para o login</a>
</div></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
