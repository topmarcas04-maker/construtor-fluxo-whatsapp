/**
 * Cliente HTTP para o motor do WhatsApp (processo separado com Baileys).
 * O motor mantém até 3 WhatsApps conectados por conta (Master, cada parceiro, cada cliente).
 */

export interface EngineStatus {
  /** idle = não iniciado | starting | qr = aguardando leitura | connected */
  state: "idle" | "starting" | "qr" | "connected";
  connected: boolean;
  phone: string | null;
  qrDataUrl: string | null;
}

function baseUrl() {
  return process.env.FLOW_ENGINE_URL || "http://localhost:3001";
}

function headers() {
  const token = process.env.FLOW_ENGINE_TOKEN;
  return {
    "Content-Type": "application/json",
    ...(token ? { "x-internal-token": token } : {}),
  };
}

function describe(err: unknown) {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const why = e?.cause?.code || e?.cause?.message || e?.message || "erro desconhecido";
  const where = process.env.FLOW_ENGINE_URL ? baseUrl() : "(FLOW_ENGINE_URL não configurada)";
  return `Não foi possível falar com o motor do WhatsApp — tentei ${where} (${why})`;
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T | { error: string }> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || `Motor respondeu ${res.status}` };
    return data as T;
  } catch (err) {
    return { error: describe(err) };
  }
}

/** slot = qual WhatsApp da conta (1 = principal, 2 ou 3) */
export function getEngineStatus(accountId: string, slot = 1) {
  return call<EngineStatus>(`/status.json?account=${encodeURIComponent(accountId)}&slot=${slot}`);
}

export function connectWhatsapp(accountId: string, slot = 1) {
  return call<EngineStatus>(`/connect`, { method: "POST", body: JSON.stringify({ accountId, slot }) }, 15000);
}

export function logoutWhatsapp(accountId: string, slot = 1) {
  return call<{ ok: boolean }>(`/logout`, { method: "POST", body: JSON.stringify({ accountId, slot }) }, 15000);
}

export function sendWhatsappMessage(
  accountId: string,
  phoneJid: string,
  text: string,
  sender: "HUMAN" | "AI" | "AUTO" = "HUMAN",
  authorName: string | null = null
) {
  return call<{ success: boolean }>(
    `/send`,
    { method: "POST", body: JSON.stringify({ accountId, phoneJid, text, sender, authorName }) },
    20000
  );
}

export interface OutgoingMedia {
  kind: "image" | "audio" | "document";
  base64: string;
  mimetype: string;
  fileName?: string | null;
  caption?: string | null;
  /** Quem envia (padrão: equipe). AUTO = automático/integração */
  sender?: "HUMAN" | "AUTO";
}

export function sendWhatsappMedia(accountId: string, phoneJid: string, media: OutgoingMedia, authorName: string | null) {
  return call<{ success: boolean }>(
    `/send-media`,
    { method: "POST", body: JSON.stringify({ accountId, phoneJid, media, authorName, sender: media.sender }) },
    60000
  );
}

/** Envia o card do produto (foto + nome + preço + descrição) pelo WhatsApp da conta */
export function sendWhatsappProduct(
  accountId: string,
  phoneJid: string,
  productId: string,
  authorName: string | null,
  imageId?: string | null,
  video?: boolean
) {
  return call<{ success: boolean }>(
    `/send-product`,
    { method: "POST", body: JSON.stringify({ accountId, phoneJid, productId, authorName, imageId: imageId || null, video: Boolean(video) }) },
    video ? 150000 : 60000
  );
}

/** Envia um arquivo do Drive (foto, vídeo, áudio ou documento) */
export function sendWhatsappDriveFile(accountId: string, phoneJid: string, fileId: string, authorName: string | null) {
  return call<{ success: boolean }>(`/send-drive`, { method: "POST", body: JSON.stringify({ accountId, phoneJid, fileId, authorName }) }, 150000);
}

/** Repassa ao motor as mensagens do Instagram/Facebook recebidas pelo webhook da Meta */
export function forwardMetaEvent(payload: unknown) {
  return call<{ ok: boolean }>(`/meta-event`, { method: "POST", body: JSON.stringify(payload) }, 25000);
}

/** Grupos do WhatsApp em que o número conectado participa */
export function listWhatsappGroups(accountId: string) {
  return call<{ groups: { jid: string; name: string; size: number | null }[] }>(
    `/groups`,
    { method: "POST", body: JSON.stringify({ accountId }) },
    20000
  );
}

/** Confere se o número tem WhatsApp e devolve o endereço (jid) certo */
export function resolveWhatsappNumber(accountId: string, phone: string) {
  return call<{ exists: boolean | null; jid: string | null }>(
    `/resolve-number`,
    { method: "POST", body: JSON.stringify({ accountId, phone }) },
    15000
  );
}
