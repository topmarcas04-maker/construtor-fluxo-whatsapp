// Cria as tabelas do banco (se ainda nao existirem). Roda antes do site e do motor.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[init-db] DATABASE_URL nao definida");
  process.exit(1);
}

const sql = `
DO $$ BEGIN CREATE TYPE flow_block_type AS ENUM ('START','TEXT_MESSAGE','IMAGE','VIDEO','AUDIO','DOCUMENT','LIST','RESPONSE_WAIT','CONDITION','END'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE flow_trigger_type AS ENUM ('FIRST_MESSAGE','KEYWORD','SCHEDULED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_state_status AS ENUM ('ACTIVE','PAUSED','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE whatsapp_status AS ENUM ('DISCONNECTED','QR_PENDING','CONNECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_direction AS ENUM ('IN','OUT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_stage AS ENUM ('PROSPECT','QUALIFIED','NEGOTIATING','CLOSED_WON','CLOSED_LOST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  phone_number varchar(40) NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flows_phone_number_idx ON flows (phone_number);
CREATE INDEX IF NOT EXISTS flows_priority_idx ON flows (priority);

CREATE TABLE IF NOT EXISTS flow_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  type flow_block_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_blocks_flow_id_idx ON flow_blocks (flow_id);

CREATE TABLE IF NOT EXISTS flow_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  from_block_id uuid NOT NULL REFERENCES flow_blocks(id) ON DELETE CASCADE,
  to_block_id uuid NOT NULL REFERENCES flow_blocks(id) ON DELETE CASCADE,
  label varchar(100),
  condition_key varchar(100),
  condition_value varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_connections_flow_id_idx ON flow_connections (flow_id);

CREATE TABLE IF NOT EXISTS flow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  type flow_trigger_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_triggers_flow_id_idx ON flow_triggers (flow_id);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id varchar(40) PRIMARY KEY DEFAULT 'default',
  status whatsapp_status NOT NULL DEFAULT 'DISCONNECTED',
  qr_code_data_url text,
  connected_phone varchar(40),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_jid varchar(60) NOT NULL,
  lead_name varchar(200),
  profile_pic_url text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_phone_jid_idx ON conversations (phone_jid);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  body text NOT NULL,
  message_type varchar(40),
  whatsapp_message_id varchar(100),
  sent_at timestamptz NOT NULL DEFAULT now(),
  media_data_url text,
  media_mime_type varchar(100),
  media_file_name varchar(255)
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  card_name varchar(200),
  stage lead_stage NOT NULL DEFAULT 'PROSPECT',
  city varchar(120),
  email varchar(200),
  phone varchar(40),
  deal_value double precision,
  closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_conversation_id_idx ON leads (conversation_id);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage);
CREATE INDEX IF NOT EXISTS leads_closed_idx ON leads (closed);

CREATE TABLE IF NOT EXISTS conversation_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  current_block_id uuid REFERENCES flow_blocks(id) ON DELETE SET NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status conversation_state_status NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_states_conversation_id_idx ON conversation_states (conversation_id);
CREATE INDEX IF NOT EXISTS conversation_states_flow_id_idx ON conversation_states (flow_id);

CREATE TABLE IF NOT EXISTS flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES conversation_states(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES flow_blocks(id) ON DELETE CASCADE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{"messageId": null, "error": null}'::jsonb
);
CREATE INDEX IF NOT EXISTS flow_executions_state_id_idx ON flow_executions (state_id);
CREATE INDEX IF NOT EXISTS flow_executions_executed_at_idx ON flow_executions (executed_at);
`;

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(sql);
  console.log("[init-db] Tabelas prontas.");
} catch (err) {
  console.error("[init-db] Erro ao criar tabelas:", err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
