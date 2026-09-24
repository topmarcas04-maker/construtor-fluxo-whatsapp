/**
 * Instagram e Facebook (Meta Graph API). Sem imports "@/": usado também pelo motor.
 * Configuração no servidor: META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, PUBLIC_APP_URL.
 * META_GRAPH_URL troca o endereço da Graph API (usado nos testes).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const graphBase = () => (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");

export type MetaChannel = "INSTAGRAM" | "MESSENGER";

export const CHANNEL_PREFIX: Record<MetaChannel, string> = { INSTAGRAM: "ig:", MESSENGER: "fb:" };

/** A conversa é do Instagram/Facebook? ("ig:123" / "fb:123") */
export function metaChannelOf(jid: string | null | undefined): MetaChannel | null {
  if (!jid) return null;
  if (jid.startsWith("ig:")) return "INSTAGRAM";
  if (jid.startsWith("fb:")) return "MESSENGER";
  return null;
}

export function metaUserId(jid: string) {
  return jid.slice(3);
}

export function metaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.PUBLIC_APP_URL);
}

export function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.code = code;
    this.subcode = subcode;
  }
}

/** Mensagem em português para os erros mais comuns da Meta */
function friendly(code?: number, subcode?: number, message?: string) {
  if (code === 10 && subcode === 2018278) return "Fora da janela de 24 horas: o cliente precisa mandar uma mensagem antes.";
  if (code === 10 || subcode === 2534022) return "Fora da janela de 24 horas da Meta para responder este cliente.";
  if (code === 190) return "A conexão com o Facebook expirou. Conecte a página de novo em Instagram e Facebook.";
  if (code === 200 || code === 3) return "A Meta não liberou esta permissão para o app (verifique a aprovação do app).";
  if (code === 551) return "Esta pessoa não está disponível para receber mensagens agora.";
  return message || "Erro da Meta";
}

async function graph<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const url = new URL(`${graphBase()}/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new GraphError(friendly(e.code, e.error_subcode, e.message), e.code, e.error_subcode);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Login com Facebook (conectar a página)
// ---------------------------------------------------------------------------

export const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
];

export function oauthRedirectUri() {
  return `${publicAppUrl()}/api/meta/callback`;
}

export function oauthDialogUrl(state: string) {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", process.env.META_APP_ID || "");
  u.searchParams.set("redirect_uri", oauthRedirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", OAUTH_SCOPES.join(","));
  return u.toString();
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  igUserId: string | null;
  igUsername: string | null;
}

/** Troca o código do login pelas páginas do usuário (com tokens de página que não expiram) */
export async function pagesFromOAuthCode(code: string): Promise<MetaPage[]> {
  const appId = process.env.META_APP_ID || "";
  const secret = process.env.META_APP_SECRET || "";
  const short = await graph<{ access_token: string }>("GET", "oauth/access_token", {
    client_id: appId,
    client_secret: secret,
    redirect_uri: oauthRedirectUri(),
    code,
  });
  const long = await graph<{ access_token: string }>("GET", "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: short.access_token,
  });
  const out: MetaPage[] = [];
  let after: string | undefined;
  for (let i = 0; i < 5; i++) {
    const page = await graph<{
      data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("GET", "me/accounts", {
      access_token: long.access_token,
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "50",
      ...(after ? { after } : {}),
    });
    for (const p of page.data || []) {
      out.push({
        id: p.id,
        name: p.name,
        accessToken: p.access_token,
        igUserId: p.instagram_business_account?.id || null,
        igUsername: p.instagram_business_account?.username || null,
      });
    }
    after = page.paging?.cursors?.after;
    if (!page.paging?.next || !after) break;
  }
  return out;
}

/** Liga a página ao app para receber as mensagens (Messenger e Instagram) */
export async function subscribePage(pageId: string, pageToken: string) {
  await graph("POST", `${pageId}/subscribed_apps`, {
    access_token: pageToken,
    subscribed_fields: "messages,messaging_postbacks,message_echoes",
  });
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  await graph("DELETE", `${pageId}/subscribed_apps`, { access_token: pageToken });
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/** Negrito do WhatsApp (*texto*) não existe no Instagram/Messenger: tira os asteriscos */
export function plainForMeta(text: string) {
  return text.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1").replace(/~([^~\n]+)~/g, "$1");
}

/** Divide textos longos (Instagram aceita até 1000 caracteres por mensagem) */
export function splitForMeta(text: string, max = 950) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendMetaText(pageToken: string, recipientId: string, text: string) {
  const r = await graph<{ message_id?: string }>(
    "POST",
    "me/messages",
    { access_token: pageToken },
    { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }
  );
  return r.message_id || null;
}

export async function sendMetaAttachment(
  pageToken: string,
  recipientId: string,
  type: "image" | "audio" | "video" | "file",
  url: string
) {
  const r = await graph<{ message_id?: string }>(
    "POST",
    "me/messages",
    { access_token: pageToken },
    {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { attachment: { type, payload: { url, is_reusable: false } } },
    }
  );
  return r.message_id || null;
}

/** Nome (e @usuario) de quem mandou a mensagem */
export async function metaProfile(pageToken: string, userId: string, channel: MetaChannel) {
  try {
    if (channel === "INSTAGRAM") {
      const p = await graph<{ name?: string; username?: string }>("GET", userId, { access_token: pageToken, fields: "name,username" });
      return { name: p.name || (p.username ? `@${p.username}` : null), handle: p.username || null };
    }
    const p = await graph<{ first_name?: string; last_name?: string; name?: string }>("GET", userId, {
      access_token: pageToken,
      fields: "first_name,last_name",
    });
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || null;
    return { name, handle: null };
  } catch {
    return { name: null, handle: null };
  }
}

/** Baixa um anexo recebido (foto/áudio/vídeo) */
export async function downloadMetaFile(url: string, maxBytes: number) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("arquivo grande demais");
  return { buffer: buf, mime: (res.headers.get("content-type") || "application/octet-stream").split(";")[0] };
}

// ---------------------------------------------------------------------------
// Segurança: assinatura do webhook e links públicos de arquivos
// ---------------------------------------------------------------------------

/** Confere o cabeçalho X-Hub-Signature-256 enviado pela Meta */
export function verifyWebhookSignature(rawBody: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

function fileKey() {
  const base = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || "dev";
  return createHash("sha256").update("sdr-file:" + base).digest();
}

/** Assinatura dos links de arquivos que a Meta precisa baixar (foto de produto, áudio etc.) */
export function signFile(kind: string, id: string) {
  return createHmac("sha256", fileKey()).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
}

export function verifyFileSignature(kind: string, id: string, sig: string | null) {
  if (!sig) return false;
  const expected = signFile(kind, id);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** kind: "msg" (arquivo de uma mensagem) ou "img" (foto de produto) */
export function publicFileUrl(kind: "msg" | "img", id: string) {
  return `${publicAppUrl()}/api/public/file/${kind}/${id}?s=${signFile(kind, id)}`;
}

/** Assina o "state" do login do Facebook (qual conta está conectando) */
export function signState(accountId: string) {
  const ts = Date.now().toString(36);
  const sig = createHmac("sha256", fileKey()).update(`state:${accountId}:${ts}`).digest("base64url").slice(0, 24);
  return `${accountId}.${ts}.${sig}`;
}

export function readState(state: string | null): string | null {
  if (!state) return null;
  const [accountId, ts, sig] = state.split(".");
  if (!accountId || !ts || !sig) return null;
  const expected = createHmac("sha256", fileKey()).update(`state:${accountId}:${ts}`).digest("base64url").slice(0, 24);
  if (sig !== expected) return null;
  if (Date.now() - parseInt(ts, 36) > 30 * 60_000) return null;
  return accountId;
}
