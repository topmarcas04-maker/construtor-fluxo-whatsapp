/**
 * FLOW ENGINE SERVER — Servidor Separado para Executar Fluxos WhatsApp
 *
 * Responsabilidades:
 * - Manter conexão WhatsApp aberta via Baileys
 * - Monitorar fila de mensagens
 * - Interpretar e executar blocos de fluxo
 * - Gerenciar estado de conversas
 * - Logar execuções
 *
 * Roda como processo separado (scripts/flow-engine-server.mts)
 */

import Baileys, {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  flows,
  flowBlocks,
  flowConnections,
  conversations,
  messages,
  leads,
  conversationStates,
  flowExecutions,
} from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment
dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
const FLOW_ENGINE_PORT = process.env.FLOW_ENGINE_PORT || "3001";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

// Database setup
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// Auth directory
const AUTH_DIR = path.join(process.cwd(), "auth_info_baileys");
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock: ReturnType<typeof makeWASocket> | null = null;
let connectedPhone: string | null = null;

/**
 * Conectar ao WhatsApp via Baileys
 */
async function connectWhatsApp() {
  console.log("[Flow Engine] Conectando ao WhatsApp...");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.ubuntu("Chrome"),
  });

  // Listeners
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "[WhatsApp]",
        shouldReconnect ? "Reconectando..." : "Desconectado"
      );

      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(), 3000);
      }
    } else if (connection === "open") {
      const id = sock!.user?.id;
      connectedPhone = id?.split(":")[0] || null;
      console.log("✅ WhatsApp Conectado:", connectedPhone);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue; // Ignore próprias mensagens

      console.log("[Mensagem Recebida]", msg.key.remoteJid);

      // Processar mensagem
      await handleIncomingMessage(msg);
    }
  });

  return sock;
}

/**
 * Processar mensagem recebida
 */
async function handleIncomingMessage(msg: any) {
  try {
    const phoneJid = msg.key.remoteJid;
    const messageBody = msg.message?.conversation || "";

    console.log(`[Flow] Mensagem de ${phoneJid}: "${messageBody}"`);

    // 1. Obter/criar conversa
    let conversation = await db.query.conversations.findFirst({
      where: eq(conversations.phoneJid, phoneJid),
    });

    if (!conversation) {
      const [newConv] = await db
        .insert(conversations)
        .values({
          phoneJid,
          leadName: "Lead",
          lastMessageAt: new Date(),
        })
        .returning();
      conversation = newConv;
    }

    // 2. Registrar mensagem
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: "IN",
      body: messageBody,
      messageType: "text",
      whatsappMessageId: msg.key.id,
      sentAt: new Date(),
    });

    // 3. Encontrar fluxo ativo para esta conversa
    let state = await db.query.conversationStates.findFirst({
      where: and(
        eq(conversationStates.conversationId, conversation.id),
        eq(conversationStates.status, "ACTIVE")
      ),
    });

    // Se não há estado, iniciar novo fluxo (trigger: FIRST_MESSAGE)
    if (!state) {
      console.log("[Flow] Iniciando novo fluxo para conversa...");
      state = await startNewFlow(conversation.id, messageBody);

      if (!state) {
        console.log("[Flow] Nenhum fluxo encontrado para esta conversa");
        return;
      }
    }

    // 4. Executar próximo bloco
    await executeFlowBlock(state, conversation, messageBody);
  } catch (error) {
    console.error("[Error] handleIncomingMessage:", error);
  }
}

/**
 * Iniciar novo fluxo (trigger: FIRST_MESSAGE ou KEYWORD)
 */
async function startNewFlow(conversationId: string, messageBody: string) {
  try {
    // Buscar fluxos com trigger FIRST_MESSAGE (ordenado por prioridade)
    const activeFlows = await db
      .select()
      .from(flows)
      .where(eq(flows.enabled, true))
      .orderBy(flows.priority);

    if (activeFlows.length === 0) {
      return null;
    }

    // Usar primeiro fluxo (menor prioridade)
    const flow = activeFlows[0];

    // Criar state de conversa
    const [newState] = await db
      .insert(conversationStates)
      .values({
        conversationId,
        flowId: flow.id,
        currentBlockId: null,
        variables: { startedWith: messageBody },
        status: "ACTIVE",
      })
      .returning();

    console.log(
      `[Flow] Novo estado criado para fluxo "${flow.name}" (ID: ${flow.id})`
    );

    return newState;
  } catch (error) {
    console.error("[Error] startNewFlow:", error);
    return null;
  }
}

/**
 * Executar próximo bloco do fluxo
 */
async function executeFlowBlock(
  state: any,
  conversation: any,
  userMessage: string
) {
  try {
    // 1. Determinar próximo bloco
    let nextBlockId: string | null = null;

    if (!state.currentBlockId) {
      // Primeira execução: encontrar bloco START
      const startBlock = await db.query.flowBlocks.findFirst({
        where: and(
          eq(flowBlocks.flowId, state.flowId),
          eq(flowBlocks.type, "START")
        ),
      });
      nextBlockId = startBlock?.id || null;
    } else {
      // Próximo bloco baseado em conexões
      const connections = await db
        .select()
        .from(flowConnections)
        .where(eq(flowConnections.fromBlockId, state.currentBlockId));

      // Se há múltiplas conexões, usar primeira (em future: implementar condições)
      nextBlockId = connections[0]?.toBlockId || null;
    }

    if (!nextBlockId) {
      console.log("[Flow] Nenhum próximo bloco encontrado, encerrando fluxo");
      await db
        .update(conversationStates)
        .set({ status: "COMPLETED" })
        .where(eq(conversationStates.id, state.id));
      return;
    }

    // 2. Buscar bloco
    const block = await db.query.flowBlocks.findFirst({
      where: eq(flowBlocks.id, nextBlockId),
    });

    if (!block) {
      console.error("[Flow] Bloco não encontrado:", nextBlockId);
      return;
    }

    console.log(`[Flow] Executando bloco: ${block.type} (${block.id})`);

    // 3. Executar bloco
    const result = await executeBlock(block, conversation, userMessage, state);

    // 4. Registrar execução
    await db.insert(flowExecutions).values({
      stateId: state.id,
      blockId: block.id,
      executedAt: new Date(),
      result,
    });

    // 5. Atualizar estado
    await db
      .update(conversationStates)
      .set({
        currentBlockId: block.id,
        updatedAt: new Date(),
      })
      .where(eq(conversationStates.id, state.id));

    console.log(`[Flow] Bloco executado com sucesso: ${block.type}`);
  } catch (error) {
    console.error("[Error] executeFlowBlock:", error);
  }
}

/**
 * Executar lógica específica do bloco
 */
async function executeBlock(
  block: any,
  conversation: any,
  userMessage: string,
  state: any
): Promise<any> {
  const config = block.config || {};

  switch (block.type) {
    case "START":
      // Enviar mensagem inicial
      if (config.message) {
        return await sendMessage(
          conversation.phoneJid,
          config.message,
          config.delay
        );
      }
      return { success: true };

    case "TEXT_MESSAGE":
      // Enviar texto
      return await sendMessage(
        conversation.phoneJid,
        config.text || "Mensagem",
        config.delay
      );

    case "IMAGE":
      // Enviar imagem
      if (config.imageUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.imageUrl,
          "image",
          config.caption
        );
      }
      return { success: true };

    case "VIDEO":
      // Enviar vídeo
      if (config.videoUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.videoUrl,
          "video",
          config.caption
        );
      }
      return { success: true };

    case "AUDIO":
      // Enviar áudio
      if (config.audioUrl) {
        return await sendMedia(conversation.phoneJid, config.audioUrl, "audio");
      }
      return { success: true };

    case "DOCUMENT":
      // Enviar documento
      if (config.documentUrl) {
        return await sendMedia(
          conversation.phoneJid,
          config.documentUrl,
          "document",
          null,
          config.fileName
        );
      }
      return { success: true };

    case "LIST":
      // Enviar menu/lista
      return await sendList(
        conversation.phoneJid,
        config.title,
        config.options
      );

    case "RESPONSE_WAIT":
      // Apenas marca que está aguardando resposta (mensagem já foi enviada)
      return { success: true, waiting: true };

    case "CONDITION":
      // Condição (implementado em conexões, aqui passa)
      return { success: true };

    case "END":
      // Encerrar fluxo
      if (config.message) {
        await sendMessage(conversation.phoneJid, config.message);
      }
      await db
        .update(conversationStates)
        .set({ status: "COMPLETED" })
        .where(eq(conversationStates.id, state.id));
      return { success: true, ended: true };

    default:
      return { success: true, blockType: block.type };
  }
}

/**
 * Enviar mensagem de texto
 */
async function sendMessage(
  phoneJid: string,
  text: string,
  delay?: number
): Promise<any> {
  if (!sock) return { error: "Socket not connected" };

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const response = await sock!.sendMessage(phoneJid, { text });

        // Registrar mensagem enviada
        const conv = await db.query.conversations.findFirst({
          where: eq(conversations.phoneJid, phoneJid),
        });

        if (conv) {
          await db.insert(messages).values({
            conversationId: conv.id,
            direction: "OUT",
            body: text,
            messageType: "text",
            whatsappMessageId: response.key.id,
            sentAt: new Date(),
          });
        }

        resolve({ success: true, messageId: response.key.id });
      } catch (error) {
        console.error("[Error] sendMessage:", error);
        resolve({ error: String(error) });
      }
    }, (delay || 0) * 1000);
  });
}

/**
 * Enviar mídia (imagem, vídeo, áudio, documento)
 */
async function sendMedia(
  phoneJid: string,
  url: string,
  type: "image" | "video" | "audio" | "document",
  caption?: string,
  fileName?: string
): Promise<any> {
  if (!sock) return { error: "Socket not connected" };

  try {
    const messageObject: any = {
      [type]:
        type === "document"
          ? { url, filename: fileName || "document" }
          : { url },
    };

    if (caption && type !== "audio" && type !== "document") {
      messageObject.caption = caption;
    }

    const response = await sock!.sendMessage(phoneJid, messageObject);

    return { success: true, messageId: response.key.id };
  } catch (error) {
    console.error(`[Error] sendMedia (${type}):`, error);
    return { error: String(error) };
  }
}

/**
 * Enviar menu/lista de opções
 */
async function sendList(
  phoneJid: string,
  title: string,
  optionsStr?: string
): Promise<any> {
  if (!sock) return { error: "Socket not connected" };

  try {
    // Parse opções de string (uma por linha)
    const options = (optionsStr || "").split("\n").filter((o) => o.trim());

    if (options.length === 0) {
      return await sendMessage(phoneJid, title || "Escolha uma opção");
    }

    // Criar lista de seções
    const sections = [
      {
        title: "Opções",
        rows: options.map((opt, idx) => ({
          id: `opt_${idx}`,
          title: opt.trim(),
          description: "",
        })),
      },
    ];

    const response = await sock!.sendMessage(phoneJid, {
      listMessage: {
        title: title || "Escolha",
        description: "",
        buttonText: "Ver opções",
        sections,
      },
    });

    return { success: true, messageId: response.key.id };
  } catch (error) {
    console.error("[Error] sendList:", error);
    // Fallback: enviar como texto
    return await sendMessage(phoneJid, title || "Escolha uma opção");
  }
}

/**
 * Main
 */
async function main() {
  console.log("🚀 Flow Engine Server iniciando...");
  console.log("📱 Conectando ao WhatsApp via Baileys...");

  try {
    await connectWhatsApp();

    console.log(
      `✅ Flow Engine rodando na porta ${FLOW_ENGINE_PORT} (PID: ${process.pid})`
    );
    console.log(
      "📡 Aguardando mensagens... (pressione Ctrl+C para parar)\n"
    );

    // Manter processo vivo
    process.on("SIGINT", async () => {
      console.log("\n🛑 Encerrando Flow Engine...");
      sock?.end(new Error("User requested shutdown"));
      await pool.end();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar Flow Engine:", error);
    process.exit(1);
  }
}

main();
