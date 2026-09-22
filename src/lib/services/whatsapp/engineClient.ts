/**
 * Cliente HTTP para o motor de fluxo (processo separado com Baileys).
 * Usado pelo app web (Next.js) para saber o status da conexão do WhatsApp
 * e para enviar mensagens manuais pelo inbox do SDR.
 */

interface EngineStatus {
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

export async function getEngineStatus(): Promise<EngineStatus | { error: string }> {
  try {
    const res = await fetch(`${baseUrl()}/status.json`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return { error: `Motor respondeu ${res.status}` };
    return await res.json();
  } catch {
    return { error: "Não foi possível conectar ao motor de fluxo" };
  }
}

export async function sendWhatsappMessage(phoneJid: string, text: string) {
  try {
    const res = await fetch(`${baseUrl()}/send`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phoneJid, text }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error || `Motor respondeu ${res.status}` };
    return data;
  } catch {
    return { error: "Não foi possível conectar ao motor de fluxo" };
  }
}
