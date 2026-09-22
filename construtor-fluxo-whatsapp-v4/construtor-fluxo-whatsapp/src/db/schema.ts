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
]);

// ============================================================================
// FLOWS & BUILDER
// ============================================================================

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
    phoneJid: varchar("phone_jid", { length: 60 }).notNull(),
    leadName: varchar("lead_name", { length: 200 }),
    profilePicUrl: text("profile_pic_url"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("conversations_phone_jid_idx").on(table.phoneJid)]
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
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    cardName: varchar("card_name", { length: 200 }),
    stage: leadStageEnum("stage").notNull().default("PROSPECT"),
    city: varchar("city", { length: 120 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    /** Valor da venda em reais */
    dealValue: doublePrecision("deal_value"),
    /** Se a venda foi fechada */
    closed: boolean("closed").notNull().default(false),
    /** Data em que a venda foi fechada */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("leads_conversation_id_idx").on(table.conversationId),
    index("leads_stage_idx").on(table.stage),
    index("leads_closed_idx").on(table.closed),
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

export const leadsRelations = relations(leads, ({ one }) => ({
  conversation: one(conversations, {
    fields: [leads.conversationId],
    references: [conversations.id],
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
