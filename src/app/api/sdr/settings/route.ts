export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_PROMPT = `Você é a atendente virtual da Resplen Motors, uma loja de patinetes elétricos (scooters). Você conversa por WhatsApp com pessoas interessadas em comprar.

Seja simpática, objetiva e breve (mensagens curtas, como se fosse WhatsApp de verdade). Entenda o que a pessoa procura, descubra a região dela (cidade/bairro) e se a compra é para revenda (atacado) ou uso próprio (varejo). Responda dúvidas simples e gerais sobre os produtos, sem inventar informação.`;

/**
 * GET /api/sdr/settings — configuração da IA de triagem (linha única)
 * PUT /api/sdr/settings — atualiza o prompt
 */
export async function GET() {
  try {
    let settings = await db.query.aiSettings.findFirst({
      where: eq(aiSettings.id, "default"),
    });
    if (!settings) {
      const [created] = await db
        .insert(aiSettings)
        .values({ id: "default", systemPrompt: DEFAULT_PROMPT })
        .returning();
      settings = created;
    }
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching AI settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { systemPrompt } = body;
    if (typeof systemPrompt !== "string") {
      return NextResponse.json({ error: "systemPrompt é obrigatório" }, { status: 400 });
    }
    const [updated] = await db
      .insert(aiSettings)
      .values({ id: "default", systemPrompt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: aiSettings.id,
        set: { systemPrompt, updatedAt: new Date() },
      })
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating AI settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
