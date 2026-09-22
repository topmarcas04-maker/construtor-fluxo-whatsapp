/**
 * Cliente HTTP para o motor do WhatsApp (processo separado com Baileys).
 * O motor mantém um WhatsApp conectado por conta (Master, cada parceiro, cada cliente).
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

export function getEngineStatus(accountId: string) {
  return call<EngineStatus>(`/status.json?account=${encodeURIComponent(accountId)}`);
}

export function connectWhatsapp(accountId: string) {
  return call<EngineStatus>(`/connect`, { method: "POST", body: JSON.stringify({ accountId }) }, 15000);
}

export function logoutWhatsapp(accountId: string) {
  return call<{ ok: boolean }>(`/logout`, { method: "POST", body: JSON.stringify({ accountId }) }, 15000);
}

export function sendWhatsappMessage(
  accountId: string,
  phoneJid: string,
  text: string,
  sender: "HUMAN" | "AI" | "AUTO" = "HUMAN"
) {
  return call<{ success: boolean }>(
    `/send`,
    { method: "POST", body: JSON.stringify({ accountId, phoneJid, text, sender }) },
    20000
  );
}
