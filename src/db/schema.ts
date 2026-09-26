/**
 * SCHEMA — Construtor de Fluxo WhatsApp
 *
 * Tabelas principais:
 * - flows — cadastro de fluxos
 * - flow_blocks — blocos dentro de cada fluxo
 * - flow_connections — ligações entre blocos
 * - flow_triggers — o que inicia um fluxo
 * - whatsapp_sessions — estado da conexão WhatsApp
 * - conversations — conversas (um por número de telefone)
 * - messages — histórico de mensagens
 * - leads — card de vendas do lead
 * - conversation_states — estado de execução de um fluxo em uma conversa
 * - flow_executions — log de blocos executados
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const flowBlockTypeEnum = pgEnum("flow_block_type", [
  "START",
  "TEXT_MESSAGE",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "LIST",
  "RESPONSE_WAIT",
  "CONDITION",
  "END",
]);

export const flowTriggerTypeEnum = pgEnum("flow_trigger_type", [
  "FIRST_MESSAGE",
  "KEYWORD",
  "SCHEDULED",
]);

export const conversationStateStatusEnum = pgEnum("conversation_state_status", [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "FAILED",
]);

export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "DISCONNECTED",
  "QR_PENDING",
  "CONNECTED",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["IN", "OUT"]);

export const leadStageEnum = pgEnum("lead_stage", [
  "PROSPECT",
  "QUALIFIED",
  "NEGOTIATING",
  "CLOSED_WON",
  "CLOSED_LOST",
  // Estágios do funil de SDR (inbox de leads via WhatsApp)
  "FIRST_CONTACT",
  "SECOND_CONTACT",
  "HOT_LEAD",
  "SALE",
]);

export const saleTypeEnum = pgEnum("sale_type", ["ANY", "WHOLESALE", "RETAIL"]);

// ============================================================================
// FLOWS & BUILDER
// ============================================================================

// ============================================================================
// CONTAS (MULTIEMPRESA): MASTER → PARCEIRO → CLIENTE
// ============================================================================

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Conta "mãe" (quem criou). Null só no Master. */
    parentId: uuid("parent_id"),
    /** MASTER | PARTNER | CLIENT */
    type: varchar("type", { length: 10 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    /** Identificador curto usado no link de login com a marca da conta (/login?c=slug) */
    slug: varchar("slug", { length: 80 }).notNull(),
    responsible: varchar("responsible", { length: 150 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    city: varchar("city", { length: 120 }),
    document: varchar("document", { length: 30 }),
    commission: doublePrecision("commission"),
    notes: text("notes"),
    /** Menus liberados pela conta mãe */
    modules: jsonb("modules").$type<string[]>().notNull().default([]),
    /** De onde vem a IA: OWN (chave própria), PARENT (usa a da conta mãe), NONE (sem IA) */
    aiSource: varchar("ai_source", { length: 10 }).notNull().default("PARENT"),
    /** Chave da API de IA, criptografada */
    aiApiKeyEnc: text("ai_api_key_enc"),
    /** Chave OpenAI (transcrever áudios) — segue a mesma regra de herança da IA */
    openaiKeyEnc: text("openai_key_enc"),
    /** Chave ElevenLabs (responder em áudio) — segue a mesma regra de herança da IA */
    elevenKeyEnc: text("eleven_key_enc"),
    /** Manter o WhatsApp desta conta conectado no motor */
    waEnabled: boolean("wa_enabled").notNull().default(false),
    /** Situação do WhatsApp, gravada pelo motor: connected | reconnecting | logged_out | idle */
    waState: varchar("wa_state", { length: 20 }),
    waPhone: varchar("wa_phone", { length: 40 }),
    waStateAt: timestamp("wa_state_at", { withTimezone: true }),
    /** Última vez que o motor viu o WhatsApp conectado (para recuperar mensagens perdidas) */
    waLastSeenAt: timestamp("wa_last_seen_at", { withTimezone: true }),
    /** Nome do WhatsApp 1 (ex.: "Vendas"), aparece quando a conta tem mais de um número */
    waLabel: varchar("wa_label", { length: 60 }),
    /** Cliente pode editar os cards dos leads (definido por quem cadastrou) */
    leadEdit: boolean("lead_edit").notNull().default(false),
    /** Cliente pode editar os próprios produtos (definido por quem cadastrou) */
    productEdit: boolean("product_edit").notNull().default(true),
    /** Plano escolhido por quem cadastrou (modelo; os benefícios ficam copiados abaixo e podem ser ajustados) */
    planId: uuid("plan_id"),
    /** Quantos números de WhatsApp a conta pode conectar (1 a 3) */
    maxWhatsapp: integer("max_whatsapp").notNull().default(1),
    /** Calls de acompanhamento por mês */
    callsPerMonth: integer("calls_per_month").notNull().default(0),
    /** Botão de suporte pelo WhatsApp */
    supportAccess: boolean("support_access").notNull().default(false),
    /** Conteúdo premium da área de membros */
    premiumAccess: boolean("premium_access").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("accounts_slug_idx").on(table.slug), index("accounts_parent_id_idx").on(table.parentId)]
);

/**
 * WhatsApps 2 e 3 da conta (o 1 continua nos campos wa* da conta; a linha do slot 1 só guarda a config).
 * A sessão deles fica no wa_auth com as chaves "s2:..." / "s3:...".
 */
export const waNumbers = pgTable(
  "wa_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** 2 ou 3 */
    slot: integer("slot").notNull(),
    label: varchar("label", { length: 60 }),
    /** Manter conectado no motor */
    enabled: boolean("enabled").notNull().default(false),
    /** Gravado pelo motor: connected | reconnecting | logged_out | idle */
    state: varchar("state", { length: 20 }),
    phone: varchar("phone", { length: 40 }),
    stateAt: timestamp("state_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Regras próprias do número: produtos, vendedores, funil e orientação da IA (ver lib/whatsapp/config) */
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wa_numbers_account_slot_idx").on(table.accountId, table.slot)]
);

/** Sessão do WhatsApp (Baileys) guardada no banco — sobrevive a novos deploys */
export const waAuth = pgTable(
  "wa_auth",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    value: text("value").notNull(),
  },
  (table) => [uniqueIndex("wa_auth_account_key_idx").on(table.accountId, table.key)]
);

export const flows = pgTable(
  "flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    phoneNumber: varchar("phone_number", { length: 40 }).notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("flows_phone_number_idx").on(table.phoneNumber),
    index("flows_priority_idx").on(table.priority),
  ]
);

export const flowBlocks = pgTable(
  "flow_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    type: flowBlockTypeEnum("type").notNull(),
    config: jsonb("config").notNull().default({}),
    positionX: integer("position_x").notNull().default(0),
    positionY: integer("position_y").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("flow_blocks_flow_id_idx").on(table.flowId)]
);

export const flowConnections = pgTable(
  "flow_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    fromBlockId: uuid("from_block_id")
      .notNull()
      .references(() => flowBlocks.id, { onDelete: "cascade" }),
    toBlockId: uuid("to_block_id")
      .notNull()
      .references(() => flowBlocks.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }),
    conditionKey: varchar("condition_key", { length: 100 }),
    conditionValue: varchar("condition_value", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("flow_connections_flow_id_idx").on(table.flowId)]
);

export const flowTriggers = pgTable(
  "flow_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    type: flowTriggerTypeEnum("type").notNull(),
    config: jsonb("config").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("flow_triggers_flow_id_idx").on(table.flowId)]
);

// ============================================================================
// WHATSAPP & CONVERSATIONS
// ============================================================================

export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: varchar("id", { length: 40 }).primaryKey().default("default"),
  status: whatsappStatusEnum("status").notNull().default("DISCONNECTED"),
  qrCodeDataUrl: text("qr_code_data_url"),
  connectedPhone: varchar("connected_phone", { length: 40 }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    phoneJid: varchar("phone_jid", { length: 60 }).notNull(),
    /** WHATSAPP | INSTAGRAM | MESSENGER — no Instagram/Facebook o phoneJid é "ig:<id>" / "fb:<id>" */
    channel: varchar("channel", { length: 20 }).notNull().default("WHATSAPP"),
    /** @usuario do Instagram (quando houver) */
    handle: varchar("handle", { length: 120 }),
    /** Página do Facebook por onde a conversa chegou (Instagram/Messenger) */
    metaPageId: varchar("meta_page_id", { length: 40 }),
    leadName: varchar("lead_name", { length: 200 }),
    profilePicUrl: text("profile_pic_url"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** Até quando a equipe já leu a conversa (mensagens do cliente depois disso = não lidas) */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    /** Quantas mensagens do cliente já tinham chegado quando a equipe leu (o resto = não lidas) */
    readInCount: integer("read_in_count").notNull().default(0),
    /** Grupo do WhatsApp (sem lead, sem IA) e se aparece no painel */
    isGroup: boolean("is_group").notNull().default(false),
    groupEnabled: boolean("group_enabled").notNull().default(false),
    /** Por qual WhatsApp da conta a conversa está (1, 2 ou 3; vazio = 1) */
    waSlot: integer("wa_slot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("conversations_account_phone_idx").on(table.accountId, table.phoneJid)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    body: text("body").notNull(),
    messageType: varchar("message_type", { length: 40 }),
    whatsappMessageId: varchar("whatsapp_message_id", { length: 100 }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    mediaDataUrl: text("media_data_url"),
    mediaMimeType: varchar("media_mime_type", { length: 100 }),
    mediaFileName: varchar("media_file_name", { length: 255 }),
    /** Quem enviou: LEAD, AI (atendente virtual), HUMAN (vendedor pelo painel/celular) ou FLOW */
    sender: varchar("sender", { length: 20 }),
    /** Nome de quem enviou pelo painel (vendedor/atendente) */
    authorName: varchar("author_name", { length: 150 }),
    /** Texto do áudio (transcrição do cliente ou o que a IA falou) */
    transcript: text("transcript"),
    /** Arquivo guardado no bucket (vídeos) em vez de media_data_url */
    mediaKey: varchar("media_key", { length: 300 }),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_sent_at_idx").on(table.sentAt),
  ]
);

// ============================================================================
// LEADS & SALES
// ============================================================================

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    cardName: varchar("card_name", { length: 200 }),
    stage: leadStageEnum("stage").notNull().default("FIRST_CONTACT"),
    /** Coluna personalizada do funil (vazio = coluna do estágio) */
    columnId: uuid("column_id").references(() => funnelColumns.id, { onDelete: "set null" }),
    /** Funil do lead (vazio = funil padrão) */
    funnelId: uuid("funnel_id").references(() => funnels.id, { onDelete: "set null" }),
    city: varchar("city", { length: 120 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    /** Vendedor responsável pelo lead (atribuído manualmente ou por regra de distribuição) */
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    /** Valor da venda em reais */
    dealValue: doublePrecision("deal_value"),
    /** Se a venda foi fechada */
    closed: boolean("closed").notNull().default(false),
    /** Data em que a venda foi fechada */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    note: text("note"),
    /** Quando true a IA não responde mais este lead (vendedor assumiu) */
    aiPaused: boolean("ai_paused").notNull().default(false),
    /** Resumo da qualificação escrito pela IA */
    aiSummary: text("ai_summary"),
    /** Nota de qualificação 0–100 dada pela IA */
    score: integer("score"),
    /** O que o lead procura (modelo, uso, quantidade…) */
    interest: varchar("interest", { length: 255 }),
    /** Última ação feita pela IA (ex.: "Reservar") e quando */
    lastAction: varchar("last_action", { length: 120 }),
    lastActionAt: timestamp("last_action_at", { withTimezone: true }),
    /** Produto de interesse (a IA identifica pela conversa; a equipe pode trocar) */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    saleType: saleTypeEnum("sale_type").notNull().default("ANY"),
    /** Chatbot (sem IA) em andamento com este lead, passo atual e tentativas sem entender */
    botId: uuid("bot_id").references(() => chatbots.id, { onDelete: "set null" }),
    botStep: varchar("bot_step", { length: 40 }),
    botTries: integer("bot_tries").notNull().default(0),
    botAt: timestamp("bot_at", { withTimezone: true }),
    /** Quando o último chatbot terminou (evita recomeçar logo em seguida) */
    botEndedAt: timestamp("bot_ended_at", { withTimezone: true }),
    /** Último chatbot que atendeu (para não repetir o mesmo logo em seguida) */
    botLastId: uuid("bot_last_id"),
    /** Recontato automático: quantas tentativas já foram e quando foi a última */
    fuCount: integer("fu_count").notNull().default(0),
    fuLastAt: timestamp("fu_last_at", { withTimezone: true }),
    /** Quando o cliente informou os dados da qualificação (libera preço e detalhes para a IA) */
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    /** Dados de qualificação coletados pela IA (endereço, uso, campos criados pela empresa…) */
    qualifyData: jsonb("qualify_data").$type<import("../lib/ai/qualify").QualifyData>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("leads_conversation_id_idx").on(table.conversationId),
    index("leads_stage_idx").on(table.stage),
    index("leads_closed_idx").on(table.closed),
    index("leads_seller_id_idx").on(table.sellerId),
    index("leads_account_id_idx").on(table.accountId),
  ]
);

// ============================================================================
// SDR — VENDEDORES, ETIQUETAS, DISTRIBUIÇÃO, RESPOSTAS RÁPIDAS, IA
// ============================================================================

export const sellers = pgTable("sellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  active: boolean("active").notNull().default(true),
  /** Turno do vendedor (mesmo formato do horário dos consultores); vazio = sempre disponível */
  shift: jsonb("shift").$type<import("../lib/ai/hours").SellerHours>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 60 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("blue"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadTags = pgTable(
  "lead_tags",
  {
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("lead_tags_lead_id_tag_id_idx").on(table.leadId, table.tagId),
    index("lead_tags_tag_id_idx").on(table.tagId),
  ]
);

export const distributionRules = pgTable(
  "distribution_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /** Cidade/bairro. Vazio = qualquer região. */
    region: varchar("region", { length: 120 }),
    saleType: saleTypeEnum("sale_type").notNull().default("ANY"),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("distribution_rules_priority_idx").on(table.priority)]
);

/** Chaves de API para outros sistemas (guardamos só o hash) */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  shortcut: varchar("shortcut", { length: 60 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configuração da IA de cada conta (id = id da conta) */
export const aiSettings = pgTable("ai_settings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  systemPrompt: text("system_prompt").notNull().default(""),
  /** Liga/desliga o atendimento automático pela IA */
  enabled: boolean("enabled").notNull().default(false),
  model: varchar("model", { length: 80 }).notNull().default("claude-sonnet-4-5"),
  /** Mensagem enviada ao lead quando a IA transfere para um vendedor. {vendedor} = nome */
  handoffMessage: text("handoff_message"),
  /** Avisar o vendedor no WhatsApp dele quando receber um lead */
  notifySeller: boolean("notify_seller").notNull().default(true),
  /** A IA pode marcar horários na agenda */
  schedulingEnabled: boolean("scheduling_enabled").notNull().default(true),
  /** Horários de atendimento (texto livre, vai para a IA) */
  businessHours: text("business_hours"),
  /** Lembrete enviado ao cliente no horário agendado. {nome} {data} {hora} {assunto} */
  reminderMessage: text("reminder_message"),
  /** Minutos antes do horário para enviar o lembrete (0 = na hora) */
  reminderMinutesBefore: integer("reminder_minutes_before").notNull().default(0),
  /** Colocar o nome de quem enviou no começo das mensagens do painel */
  signMessages: boolean("sign_messages").notNull().default(true),
  /** A IA consulta o catálogo de produtos (preço, descrição) e envia fotos */
  catalogEnabled: boolean("catalog_enabled").notNull().default(true),
  /** WhatsApp que recebe alertas (ex.: WhatsApp desconectado) */
  alertPhone: varchar("alert_phone", { length: 40 }),
  /** Transcrever os áudios dos clientes para a IA entender */
  transcribeAudio: boolean("transcribe_audio").notNull().default(true),
  /** Responder em áudio quando o cliente mandar áudio */
  voiceReplies: boolean("voice_replies").notNull().default(false),
  /** Voz da ElevenLabs usada nas respostas */
  voiceId: varchar("voice_id", { length: 80 }),
  voiceName: varchar("voice_name", { length: 120 }),
  /** Estilo de conversa (ver lib/ai/style.ts) e texto do estilo personalizado */
  style: varchar("style", { length: 20 }).notNull().default("FRIENDLY"),
  styleCustom: text("style_custom"),
  /** Tamanho das respostas (SHORT | MEDIUM | LONG) e emojis (NONE | LOW | MANY) */
  replyLength: varchar("reply_length", { length: 10 }).notNull().default("MEDIUM"),
  emojiLevel: varchar("emoji_level", { length: 10 }).notNull().default("LOW"),
  /** Ritmo da resposta (FAST | NATURAL | CALM) — espera mostrando "digitando..." */
  replySpeed: varchar("reply_speed", { length: 10 }).notNull().default("NATURAL"),
  /** IA pergunta se o cliente quer ver o vídeo do produto */
  offerVideo: boolean("offer_video").notNull().default(true),
  /** Horário dos consultores (ver lib/ai/hours.ts) e mensagem de transferência fora do horário */
  sellerHours: jsonb("seller_hours").$type<import("../lib/ai/hours").SellerHours>(),
  afterHoursMessage: text("after_hours_message"),
  /** Qualificação do lead (ver lib/ai/qualify.ts) */
  qualify: jsonb("qualify").$type<import("../lib/ai/qualify").QualifySettings>(),
  /** Rodízio entre vendedores empatados: quantos leads seguidos cada um recebe */
  rotationEnabled: boolean("rotation_enabled").notNull().default(false),
  rotationBatch: integer("rotation_batch").notNull().default(1),
  rotationState: jsonb("rotation_state").$type<import("../lib/ai/distribution").RotationState>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// SAAS: PARCEIROS, USUÁRIOS/PERMISSÕES E PLATAFORMA
// ============================================================================

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  responsible: varchar("responsible", { length: 150 }),
  email: varchar("email", { length: 200 }),
  phone: varchar("phone", { length: 40 }),
  city: varchar("city", { length: 120 }),
  document: varchar("document", { length: 30 }),
  /** Comissão em % */
  commission: doublePrecision("commission"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    /** MASTER (dono da plataforma), ADMIN (administrador da conta), SELLER (vendedor) */
    role: varchar("role", { length: 20 }).notNull().default("SELLER"),
    /** Conta (empresa) do usuário */
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /** Módulos liberados (dentro dos que a conta tem) */
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("app_users_email_idx").on(table.email)]
);

/** Identidade visual de cada conta (id = id da conta). Sem registro = herda da conta mãe. */
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("display_name", { length: 120 }).notNull().default("SDR WhatsApp"),
  subtitle: varchar("subtitle", { length: 120 }),
  /** Logo em data URL (PNG/SVG/JPG, até ~350 KB) */
  logo: text("logo"),
  menuBg: varchar("menu_bg", { length: 20 }).notNull().default("#155e75"),
  menuText: varchar("menu_text", { length: 20 }).notNull().default("#ffffff"),
  menuActive: varchar("menu_active", { length: 20 }).notNull().default("#ffffff"),
  topBg: varchar("top_bg", { length: 20 }).notNull().default("#ffffff"),
  topText: varchar("top_text", { length: 20 }).notNull().default("#0f172a"),
  accent: varchar("accent", { length: 20 }).notNull().default("#155e75"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// PLANOS E SERVIÇOS (suporte, calls)
// ============================================================================

/** Plano que uma conta (Master ou Parceiro) oferece às contas que cadastra */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Conta dona do plano (quem vende) */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    /** Preço como texto livre (ex.: "R$ 297/mês") */
    price: varchar("price", { length: 60 }),
    modules: jsonb("modules").$type<string[]>().notNull().default([]),
    maxWhatsapp: integer("max_whatsapp").notNull().default(1),
    callsPerMonth: integer("calls_per_month").notNull().default(0),
    supportAccess: boolean("support_access").notNull().default(false),
    premiumAccess: boolean("premium_access").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("plans_account_idx").on(table.accountId)]
);

/** Serviços que a conta presta às contas abaixo dela: WhatsApp de suporte e agenda de calls */
export const accountServices = pgTable("account_services", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  supportPhone: varchar("support_phone", { length: 40 }),
  /** Horário do suporte (texto, aparece para o cliente) */
  supportHours: varchar("support_hours", { length: 160 }),
  /** Horários livres para calls de acompanhamento (mesmo formato do horário dos consultores) */
  callHours: jsonb("call_hours").$type<import("../lib/ai/hours").SellerHours>(),
  /** Duração de cada call (minutos) */
  callMinutes: integer("call_minutes").notNull().default(30),
  /** Link fixo da reunião (Meet, Zoom...). Pode ser trocado em cada call */
  callLink: varchar("call_link", { length: 500 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Call de acompanhamento marcada por uma conta com quem a cadastrou */
export const supportCalls = pgTable(
  "support_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quem atende (conta mãe) */
    providerAccountId: uuid("provider_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Quem marcou */
    clientAccountId: uuid("client_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userName: varchar("user_name", { length: 150 }),
    phone: varchar("phone", { length: 40 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    topic: text("topic"),
    meetingLink: varchar("meeting_link", { length: 500 }),
    /** SCHEDULED | DONE | CANCELED | NO_SHOW */
    status: varchar("status", { length: 10 }).notNull().default("SCHEDULED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("support_calls_provider_idx").on(table.providerAccountId, table.startsAt), index("support_calls_client_idx").on(table.clientAccountId)]
);

// ============================================================================
// DISPAROS (envio em massa)
// ============================================================================

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Texto (variações separadas por uma linha com ---) */
    message: text("message").notNull(),
    /** Arquivo do Drive enviado junto (opcional) */
    driveFileId: uuid("drive_file_id"),
    /** Filtros usados para montar o público (ver lib/broadcast/common.ts) */
    filters: jsonb("filters").notNull().default({}),
    /** DRAFT | SCHEDULED | RUNNING | PAUSED | DONE | CANCELED */
    status: varchar("status", { length: 12 }).notNull().default("SCHEDULED"),
    minDelay: integer("min_delay").notNull().default(40),
    maxDelay: integer("max_delay").notNull().default(120),
    windowStart: varchar("window_start", { length: 5 }).notNull().default("08:00"),
    windowEnd: varchar("window_end", { length: 5 }).notNull().default("20:00"),
    dailyLimit: integer("daily_limit").notNull().default(200),
    total: integer("total").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    nextAt: timestamp("next_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: varchar("created_by", { length: 150 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("broadcasts_account_idx").on(table.accountId), index("broadcasts_status_idx").on(table.status)]
);

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    leadId: uuid("lead_id"),
    conversationId: uuid("conversation_id"),
    phoneJid: varchar("phone_jid", { length: 60 }).notNull(),
    name: varchar("name", { length: 200 }),
    city: varchar("city", { length: 120 }),
    /** PENDING | SENT | FAILED | SKIPPED */
    status: varchar("status", { length: 10 }).notNull().default("PENDING"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("broadcast_recipients_bc_status_idx").on(table.broadcastId, table.status),
    index("broadcast_recipients_account_sent_idx").on(table.accountId, table.sentAt),
  ]
);

// ============================================================================
// DRIVE (arquivos e vídeos da conta)
// ============================================================================

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("drive_folders_account_idx").on(table.accountId)]
);

export const driveFiles = pgTable(
  "drive_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id"),
    name: varchar("name", { length: 200 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    size: integer("size").notNull(),
    /** image | video | audio | document */
    kind: varchar("kind", { length: 10 }).notNull(),
    storageKey: varchar("storage_key", { length: 300 }).notNull(),
    createdBy: varchar("created_by", { length: 150 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("drive_files_account_idx").on(table.accountId, table.folderId)]
);

// ============================================================================
// ÁREA DE MEMBROS (aulas gravadas)
// ============================================================================

/** Curso criado por uma conta (Master ou Parceiro) para as contas abaixo dela */
export const memberCourses = pgTable(
  "member_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 150 }).notNull(),
    description: text("description"),
    /** Capa em data URL (até ~400 KB) */
    cover: text("cover"),
    premium: boolean("premium").notNull().default(false),
    published: boolean("published").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("member_courses_account_idx").on(table.accountId)]
);

export const memberModules = pgTable("member_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => memberCourses.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 150 }).notNull(),
  sort: integer("sort").notNull().default(0),
});

export const memberLessons = pgTable(
  "member_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => memberCourses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => memberModules.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    /** Vídeo enviado para o bucket */
    videoKey: varchar("video_key", { length: 300 }),
    /** Ou link de vídeo (YouTube, Vimeo, Panda...) */
    videoUrl: varchar("video_url", { length: 500 }),
    /** Material de apoio: arquivos do Drive do autor */
    driveFileIds: jsonb("drive_file_ids").$type<string[]>().notNull().default([]),
    durationMin: integer("duration_min"),
    premium: boolean("premium").notNull().default(false),
    published: boolean("published").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("member_lessons_course_idx").on(table.courseId)]
);

export const memberProgress = pgTable(
  "member_progress",
  {
    userId: uuid("user_id").notNull(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => memberLessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("member_progress_user_lesson_idx").on(table.userId, table.lessonId)]
);

// ============================================================================
// INSTAGRAM E FACEBOOK (META)
// ============================================================================

/** Página do Facebook (e o Instagram ligado a ela) conectada a uma conta */
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    pageId: varchar("page_id", { length: 40 }).notNull(),
    pageName: varchar("page_name", { length: 200 }),
    /** Token da página (criptografado) */
    pageTokenEnc: text("page_token_enc").notNull(),
    igUserId: varchar("ig_user_id", { length: 40 }),
    igUsername: varchar("ig_username", { length: 120 }),
    /** Responder mensagens do Messenger (Facebook) */
    messengerEnabled: boolean("messenger_enabled").notNull().default(true),
    /** Responder mensagens do Direct do Instagram */
    instagramEnabled: boolean("instagram_enabled").notNull().default(true),
    status: varchar("status", { length: 20 }).notNull().default("connected"),
    lastError: text("last_error"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_connections_page_idx").on(table.pageId),
    index("meta_connections_account_idx").on(table.accountId),
    index("meta_connections_ig_idx").on(table.igUserId),
  ]
);

/** Páginas encontradas no login do Facebook, aguardando a escolha (expira em 1 hora) */
export const metaPending = pgTable("meta_pending", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  /** JSON criptografado com as páginas e tokens */
  payloadEnc: text("payload_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// AÇÕES DA IA (procedimentos por produto/categoria)
// ============================================================================

/**
 * O que a IA faz quando o cliente se interessa por um produto.
 * kind: SCHEDULE (marca na agenda) | CALL (pede ligação) | RESERVE (reserva) | HANDOFF (passa ao vendedor) | INFO (só explica)
 */
export const aiActions = pgTable(
  "ai_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    kind: varchar("kind", { length: 12 }).notNull().default("INFO"),
    /** Como a IA conduz: o que explicar, o que perguntar */
    instructions: text("instructions"),
    /** SCHEDULE: título na agenda e duração */
    appointmentTitle: varchar("appointment_title", { length: 120 }),
    appointmentMinutes: integer("appointment_minutes"),
    /** Coluna do funil para onde vai o card ao concluir (opcional) */
    columnId: uuid("column_id").references(() => funnelColumns.id, { onDelete: "set null" }),
    /** Passar para um vendedor ao concluir */
    handoff: boolean("handoff").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_actions_account_idx").on(table.accountId)]
);

// ============================================================================
// RECONTATO AUTOMÁTICO (FOLLOW-UP)
// ============================================================================

/** Configuração do recontato de cada conta (id = id da conta). Ver lib/followup/common.ts */
export const followupSettings = pgTable("followup_settings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  config: jsonb("config").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// CHATBOT (MENUS AUTOMÁTICOS SEM IA)
// ============================================================================

/**
 * Chatbot de menu: o cliente responde com o número da opção.
 * trigger: START (início de conversa) | KEYWORD (palavra-chave) | TAG (lead com etiqueta)
 * steps: passos com mensagem e opções (ver lib/chatbot/common.ts)
 */
export const chatbots = pgTable(
  "chatbots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    trigger: varchar("trigger", { length: 20 }).notNull().default("START"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    tagIds: jsonb("tag_ids").$type<string[]>().notNull().default([]),
    /** Não começa se o lead tiver alguma destas etiquetas */
    skipTagIds: jsonb("skip_tag_ids").$type<string[]>().notNull().default([]),
    channels: jsonb("channels").$type<string[]>().notNull().default(["WHATSAPP", "INSTAGRAM", "MESSENGER"]),
    /** Recomeça se o lead voltar depois de X horas sem conversa */
    restartHours: integer("restart_hours").notNull().default(24),
    steps: jsonb("steps").$type<unknown[]>().notNull().default([]),
    fallbackMessage: text("fallback_message"),
    maxTries: integer("max_tries").notNull().default(2),
    /** Depois de errar as tentativas: HUMAN | AI | END */
    afterFail: varchar("after_fail", { length: 10 }).notNull().default("HUMAN"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("chatbots_account_idx").on(table.accountId)]
);

// ============================================================================
// FUNIL (COLUNAS PERSONALIZADAS)
// ============================================================================

/** Funis da conta (ex.: "Scooters", "Planos"). O funil padrão recebe os leads sem funil definido. */
export const funnels = pgTable(
  "funnels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("funnels_account_idx").on(table.accountId)]
);

/**
 * Colunas do funil de cada conta. kind = FIRST_CONTACT | SECOND_CONTACT | HOT_LEAD | SALE
 * (colunas fixas, podem ser renomeadas) ou CUSTOM (criadas pelo usuário).
 * aiRule: quando preenchido, a IA coloca o lead nesta coluna quando a regra se aplica.
 */
export const funnelColumns = pgTable(
  "funnel_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Funil ao qual a coluna pertence */
    funnelId: uuid("funnel_id").references(() => funnels.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull().default("CUSTOM"),
    aiRule: text("ai_rule"),
    color: varchar("color", { length: 20 }),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("funnel_columns_account_idx").on(table.accountId)]
);

// ============================================================================
// PRODUTOS (CATÁLOGO)
// ============================================================================

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    sort: integer("sort").notNull().default(0),
    /** Funil para onde vão os leads interessados nesta categoria */
    funnelId: uuid("funnel_id"),
    /** Ações da IA permitidas para os produtos da categoria (ids) */
    actionIds: jsonb("action_ids").$type<string[]>().notNull().default([]),
    /** Ação principal (a IA oferece primeiro) */
    primaryActionId: uuid("primary_action_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_categories_account_idx").on(table.accountId)]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    /** Preço em reais (vazio = sob consulta) */
    price: doublePrecision("price"),
    /** Preço promocional (opcional) */
    promoPrice: doublePrecision("promo_price"),
    code: varchar("code", { length: 60 }),
    active: boolean("active").notNull().default(true),
    /** PHYSICAL = produto físico | PLAN = plano/mensalidade | SERVICE = serviço */
    kind: varchar("kind", { length: 10 }).notNull().default("PHYSICAL"),
    /** Planos: MONTH (mensal) | YEAR (anual) */
    billingPeriod: varchar("billing_period", { length: 10 }).notNull().default("MONTH"),
    /** Planos: taxa de adesão */
    setupFee: doublePrecision("setup_fee"),
    /** Planos: fidelidade em meses */
    commitmentMonths: integer("commitment_months"),
    /** Planos: dias de teste grátis */
    trialDays: integer("trial_days"),
    /** Serviços: duração em minutos */
    durationMinutes: integer("duration_minutes"),
    /** READY = pronta entrega | ORDER = pedido/reserva (com prazo) */
    availability: varchar("availability", { length: 10 }).notNull().default("READY"),
    /** Prazo de entrega em dias (pedido/reserva) */
    leadTimeDays: integer("lead_time_days"),
    /** Ações da IA deste produto (vazio = as da categoria) */
    actionIds: jsonb("action_ids").$type<string[]>().notNull().default([]),
    primaryActionId: uuid("primary_action_id"),
    /** Preços a prazo no cartão: até 3 opções [{ n: 12, total: 14990 }] */
    installments: jsonb("installments").$type<{ n: number; total: number | null }[]>().notNull().default([]),
    /** Vídeo do produto no bucket (já comprimido em MP4) */
    videoKey: varchar("video_key", { length: 300 }),
    videoBytes: integer("video_bytes"),
    videoSeconds: integer("video_seconds"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_account_idx").on(table.accountId), index("products_category_idx").on(table.categoryId)]
);

/** Fotos do produto (a primeira é a principal) */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    dataUrl: text("data_url").notNull(),
    /** Nome da foto (ex.: a cor "Azul") — a IA usa para mandar a foto certa */
    label: varchar("label", { length: 60 }),
    /** Cor ligada/desligada (desligada: a IA não oferece nem envia) */
    active: boolean("active").notNull().default(true),
    /** Vazio = igual ao produto | READY | ORDER */
    availability: varchar("availability", { length: 10 }),
    leadTimeDays: integer("lead_time_days"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("product_images_product_idx").on(table.productId)]
);

// ============================================================================
// AGENDA
// ============================================================================

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    notes: text("notes"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    /** SCHEDULED | DONE | CANCELED | NO_SHOW */
    status: varchar("status", { length: 12 }).notNull().default("SCHEDULED"),
    /** Enviar lembrete no WhatsApp do cliente */
    reminderEnabled: boolean("reminder_enabled").notNull().default(true),
    reminderMessage: text("reminder_message"),
    reminderMinutesBefore: integer("reminder_minutes_before").notNull().default(0),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    reminderError: text("reminder_error"),
    /** AI | HUMAN */
    createdBy: varchar("created_by", { length: 10 }).notNull().default("HUMAN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_account_starts_idx").on(table.accountId, table.startsAt),
    index("appointments_lead_id_idx").on(table.leadId),
  ]
);

// ============================================================================
// FLOW EXECUTION
// ============================================================================

export const conversationStates = pgTable(
  "conversation_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    currentBlockId: uuid("current_block_id").references(() => flowBlocks.id, {
      onDelete: "set null",
    }),
    /** Variáveis de contexto da conversa (nome, respostas, etc.) */
    variables: jsonb("variables").notNull().default({}),
    status: conversationStateStatusEnum("status").notNull().default("ACTIVE"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_states_conversation_id_idx").on(table.conversationId),
    index("conversation_states_flow_id_idx").on(table.flowId),
  ]
);

export const flowExecutions = pgTable(
  "flow_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateId: uuid("state_id")
      .notNull()
      .references(() => conversationStates.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => flowBlocks.id, { onDelete: "cascade" }),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    result: jsonb("result").notNull().default({ messageId: null, error: null }),
  },
  (table) => [
    index("flow_executions_state_id_idx").on(table.stateId),
    index("flow_executions_executed_at_idx").on(table.executedAt),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const flowsRelations = relations(flows, ({ many }) => ({
  blocks: many(flowBlocks),
  connections: many(flowConnections),
  triggers: many(flowTriggers),
}));

export const flowBlocksRelations = relations(flowBlocks, ({ one }) => ({
  flow: one(flows, { fields: [flowBlocks.flowId], references: [flows.id] }),
}));

export const flowConnectionsRelations = relations(flowConnections, ({ one }) => ({
  flow: one(flows, { fields: [flowConnections.flowId], references: [flows.id] }),
}));

export const flowTriggersRelations = relations(flowTriggers, ({ one }) => ({
  flow: one(flows, { fields: [flowTriggers.flowId], references: [flows.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  leads: many(leads),
  states: many(conversationStates),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [leads.conversationId],
    references: [conversations.id],
  }),
  seller: one(sellers, {
    fields: [leads.sellerId],
    references: [sellers.id],
  }),
  leadTags: many(leadTags),
  appointments: many(appointments),
  product: one(products, { fields: [leads.productId], references: [products.id] }),
}));

export const partnersRelations = relations(partners, ({ many }) => ({
  users: many(appUsers),
}));

export const appUsersRelations = relations(appUsers, ({ one }) => ({
  seller: one(sellers, { fields: [appUsers.sellerId], references: [sellers.id] }),
  partner: one(partners, { fields: [appUsers.partnerId], references: [partners.id] }),
  account: one(accounts, { fields: [appUsers.accountId], references: [accounts.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  parent: one(accounts, { fields: [accounts.parentId], references: [accounts.id], relationName: "children" }),
  children: many(accounts, { relationName: "children" }),
  users: many(appUsers),
}));

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  lead: one(leads, { fields: [appointments.leadId], references: [leads.id] }),
  seller: one(sellers, { fields: [appointments.sellerId], references: [sellers.id] }),
  account: one(accounts, { fields: [appointments.accountId], references: [accounts.id] }),
}));

export const sellersRelations = relations(sellers, ({ many }) => ({
  leads: many(leads),
  rules: many(distributionRules),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  leadTags: many(leadTags),
}));

export const leadTagsRelations = relations(leadTags, ({ one }) => ({
  lead: one(leads, { fields: [leadTags.leadId], references: [leads.id] }),
  tag: one(tags, { fields: [leadTags.tagId], references: [tags.id] }),
}));

export const distributionRulesRelations = relations(distributionRules, ({ one }) => ({
  seller: one(sellers, {
    fields: [distributionRules.sellerId],
    references: [sellers.id],
  }),
}));

export const conversationStatesRelations = relations(
  conversationStates,
  ({ one, many }) => ({
    conversation: one(conversations, {
      fields: [conversationStates.conversationId],
      references: [conversations.id],
    }),
    flow: one(flows, {
      fields: [conversationStates.flowId],
      references: [flows.id],
    }),
    executions: many(flowExecutions),
  })
);

export const flowExecutionsRelations = relations(flowExecutions, ({ one }) => ({
  state: one(conversationStates, {
    fields: [flowExecutions.stateId],
    references: [conversationStates.id],
  }),
  block: one(flowBlocks, {
    fields: [flowExecutions.blockId],
    references: [flowBlocks.id],
  }),
}));
