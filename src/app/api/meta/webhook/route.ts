export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/meta/graph";
import { forwardMetaEvent } from "@/lib/services/whatsapp/engineClient";

/** GET — a Meta confere o endereço do webhook (Verify Token) */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const expected = process.env.META_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && expected && q.get("hub.verify_token") === expected) {
    return new NextResponse(q.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Verify token inválido", { status: 403 });
}

/** POST — mensagens novas do Instagram/Messenger: confere a assinatura e repassa ao motor */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("assinatura inválida", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("ok", { status: 200 });
  }
  const r = await forwardMetaEvent(payload);
  if ("error" in r) {
    console.error("[meta webhook] motor indisponível:", r.error);
    // A Meta tenta de novo quando a resposta não é 200
    return new NextResponse("motor indisponível", { status: 503 });
  }
  return new NextResponse("ok", { status: 200 });
}
