// Cria as tabelas do banco (se ainda nao existirem). Roda antes do site e do motor.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[init-db] DATABASE_URL nao definida");
  process.exit(1);
}

// Novos valores de enum precisam ser adicionados (e "confirmados") em uma
// transação separada da que os usa (ex.: como DEFAULT de coluna), senão o
// Postgres recusa com "unsafe use of new value of enum type".
const enumSql = `
DO $$ BEGIN CREATE TYPE flow_block_type AS ENUM ('START','TEXT_MESSAGE','IMAGE','VIDEO','AUDIO','DOCUMENT','LIST','RESPONSE_WAIT','CONDITION','END'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE flow_trigger_type AS ENUM ('FIRST_MESSAGE','KEYWORD','SCHEDULED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_state_status AS ENUM ('ACTIVE','PAUSED','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE whatsapp_status AS ENUM ('DISCONNECTED','QR_PENDING','CONNECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_direction AS ENUM ('IN','OUT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_stage AS ENUM ('PROSPECT','QUALIFIED','NEGOTIATING','CLOSED_WON','CLOSED_LOST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sale_type AS ENUM ('ANY','WHOLESALE','RETAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'FIRST_CONTACT';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'SECOND_CONTACT';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'HOT_LEAD';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'SALE';
`;

const sql = `

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

CREATE TABLE IF NOT EXISTS sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  phone varchar(40),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  card_name varchar(200),
  stage lead_stage NOT NULL DEFAULT 'FIRST_CONTACT',
  city varchar(120),
  email varchar(200),
  phone varchar(40),
  seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL,
  deal_value double precision,
  closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL;
ALTER TABLE leads ALTER COLUMN stage SET DEFAULT 'FIRST_CONTACT';
CREATE UNIQUE INDEX IF NOT EXISTS leads_conversation_id_idx ON leads (conversation_id);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage);
CREATE INDEX IF NOT EXISTS leads_closed_idx ON leads (closed);
CREATE INDEX IF NOT EXISTS leads_seller_id_idx ON leads (seller_id);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) NOT NULL,
  color varchar(20) NOT NULL DEFAULT 'blue',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_tags_lead_id_tag_id_idx ON lead_tags (lead_id, tag_id);
CREATE INDEX IF NOT EXISTS lead_tags_tag_id_idx ON lead_tags (tag_id);

CREATE TABLE IF NOT EXISTS distribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region varchar(120),
  sale_type sale_type NOT NULL DEFAULT 'ANY',
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS distribution_rules_priority_idx ON distribution_rules (priority);

CREATE TABLE IF NOT EXISTS quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut varchar(60) NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id varchar(20) PRIMARY KEY DEFAULT 'default',
  system_prompt text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A linha "default" é criada pela API (GET /api/sdr/settings) na primeira
-- vez, já com o texto padrão da IA de triagem — não semeamos aqui pra não
-- gravar um prompt vazio antes disso.

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS model varchar(80) NOT NULL DEFAULT 'claude-sonnet-4-5';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS handoff_message text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS notify_seller boolean NOT NULL DEFAULT true;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender varchar(20);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sale_type sale_type NOT NULL DEFAULT 'ANY';

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  responsible varchar(150),
  email varchar(200),
  phone varchar(40),
  city varchar(120),
  document varchar(30),
  commission double precision,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  email varchar(200) NOT NULL,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'SELLER',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_idx ON app_users (email);

CREATE TABLE IF NOT EXISTS platform_settings (
  id varchar(20) PRIMARY KEY DEFAULT 'default',
  display_name varchar(120) NOT NULL DEFAULT 'SDR WhatsApp',
  subtitle varchar(120),
  logo text,
  menu_bg varchar(20) NOT NULL DEFAULT '#155e75',
  menu_text varchar(20) NOT NULL DEFAULT '#ffffff',
  menu_active varchar(20) NOT NULL DEFAULT '#ffffff',
  top_bg varchar(20) NOT NULL DEFAULT '#ffffff',
  top_text varchar(20) NOT NULL DEFAULT '#0f172a',
  accent varchar(20) NOT NULL DEFAULT '#155e75',
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  // Roda em duas transações: os novos valores de enum precisam estar
  // "confirmados" antes de serem usados como DEFAULT de coluna.
  await client.query(enumSql);
  await client.query(sql);
  console.log("[init-db] Tabelas prontas.");
} catch (err) {
  console.error("[init-db] Erro ao criar tabelas:", err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
