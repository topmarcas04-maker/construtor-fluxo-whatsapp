export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";

const DEFAULT_PROMPT = `Você é a atendente virtual da Resplen Motors, uma loja de patinetes e scooters elétricos. Você conversa pelo WhatsApp com pessoas interessadas em comprar.

Como atender:
- Seja simpática, objetiva e breve (mensagens curtas, como WhatsApp de verdade). No máximo uma pergunta por mensagem.
- Descubra: o nome da pessoa, a cidade/bairro, o que ela procura (modelo, uso, autonomia, faixa de preço) e se a compra é para uso próprio (varejo) ou para revender (atacado).
- Responda dúvidas gerais sem inventar preços, prazos ou estoque. Se não souber, diga que um consultor vai confirmar.
- Quando a pessoa estiver pronta para comprar, pedir orçamento/preço, pedir para falar com alguém, ou for atacado, transfira para um vendedor.`;

const DEFAULT_HANDOFF =
  "Perfeito! Vou te passar agora para {vendedor}, nosso consultor, que vai continuar seu atendimento por aqui. 😊";

async function ensure() {
  let settings = await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, "default") });
  if (!settings) {
    const [created] = await db
      .insert(aiSettings)
      .values({ id: "default", systemPrompt: DEFAULT_PROMPT, handoffMessage: DEFAULT_HANDOFF })
      .onConflictDoNothing()
      .returning();
    settings = created || (await db.query.aiSettings.findFirst({ where: eq(aiSettings.id, "default") }));
  }
  return settings!;
}

export async function GET() {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  try {
    const s = await ensure();
    return NextResponse.json({ ...s, handoffMessage: s.handoffMessage ?? DEFAULT_HANDOFF });
  } catch (error) {
    console.error("Error fetching AI settings:", error);
    return NextResponse.json({ error: "Falha ao carregar configurações" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser("configuracoes");
  if (auth.error) return auth.error;
  try {
    await ensure();
    const body = await req.json();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.systemPrompt === "string") set.systemPrompt = body.systemPrompt;
    if (typeof body.enabled === "boolean") set.enabled = body.enabled;
    if (typeof body.notifySeller === "boolean") set.notifySeller = body.notifySeller;
    if (typeof body.model === "string" && body.model.trim()) set.model = body.model.trim().slice(0, 80);
    if (typeof body.handoffMessage === "string") set.handoffMessage = body.handoffMessage;
    const [updated] = await db.update(aiSettings).set(set).where(eq(aiSettings.id, "default")).returning();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating AI settings:", error);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
