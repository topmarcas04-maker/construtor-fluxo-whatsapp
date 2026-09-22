export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/server";
import { resolveAccountAiKey } from "@/lib/tenancy/server";

/** Testa se a integração de IA da conta está funcionando (uma chamada bem pequena) */
export async function POST() {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  const ai = await resolveAccountAiKey(auth.accountId);
  if (!ai.apiKey) {
    return NextResponse.json({
      ok: false,
      error: ai.reason === "NONE" ? "IA não liberada para esta conta" : "Nenhuma chave de IA cadastrada",
    });
  }
  const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, auth.accountId) });
  try {
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: s?.model || "claude-sonnet-4-5",
        max_tokens: 5,
        messages: [{ role: "user", content: "Responda só: ok" }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ ok: false, error: data?.error?.message || `Erro ${res.status}` });
    return NextResponse.json({ ok: true, provider: ai.providerAccountName });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
