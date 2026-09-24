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
-- (índice antigo por telefone removido: o mesmo cliente pode falar com contas diferentes)

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

-- =====================================================================
-- MULTIEMPRESA: Master -> Parceiro -> Cliente
-- =====================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  type varchar(10) NOT NULL,
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL,
  responsible varchar(150),
  email varchar(200),
  phone varchar(40),
  city varchar(120),
  document varchar(30),
  commission double precision,
  notes text,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_source varchar(10) NOT NULL DEFAULT 'PARENT',
  ai_api_key_enc text,
  wa_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_slug_idx ON accounts (slug);
CREATE INDEX IF NOT EXISTS accounts_parent_id_idx ON accounts (parent_id);

-- Conta Master (dona da plataforma): criada uma vez, recebe todos os dados que já existiam
INSERT INTO accounts (type, name, slug, modules, ai_source, wa_enabled)
SELECT 'MASTER',
       COALESCE((SELECT subtitle FROM platform_settings WHERE id = 'default' AND subtitle IS NOT NULL LIMIT 1), 'Resplen Motors'),
       'master', '[]'::jsonb, 'OWN', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE type = 'MASTER');

-- Parceiros cadastrados na versão anterior viram contas de parceiro (mesmo id)
INSERT INTO accounts (id, parent_id, type, name, slug, responsible, email, phone, city, document, commission, notes, modules, ai_source, active, created_at)
SELECT p.id, (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1), 'PARTNER', p.name,
       'p-' || substr(replace(p.id::text, '-', ''), 1, 10),
       p.responsible, p.email, p.phone, p.city, p.document, p.commission, p.notes,
       '["visao-geral","whatsapp","leads","agenda","configuracoes","parceiros","permissoes","plataforma"]'::jsonb,
       'PARENT', p.active, p.created_at
FROM partners p
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = p.id);

CREATE TABLE IF NOT EXISTS wa_auth (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key varchar(255) NOT NULL,
  value text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_auth_account_key_idx ON wa_auth (account_id, key);

-- account_id em todas as tabelas de dados
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;

-- Usuários antigos do tipo "Parceiro" passam a administrar a conta do parceiro
UPDATE app_users SET account_id = partner_id, role = 'ADMIN',
       permissions = '["visao-geral","whatsapp","leads","agenda","configuracoes","parceiros","permissoes","plataforma"]'::jsonb
WHERE account_id IS NULL AND role = 'PARTNER' AND partner_id IN (SELECT id FROM accounts);

UPDATE conversations SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE leads l SET account_id = c.account_id FROM conversations c WHERE l.account_id IS NULL AND c.id = l.conversation_id;
UPDATE sellers SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE tags SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE quick_replies SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE distribution_rules SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE app_users SET account_id = (SELECT id FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE account_id IS NULL;
UPDATE app_users SET role = 'ADMIN' WHERE role = 'PARTNER';

-- Mesmo número pode conversar com empresas diferentes
DROP INDEX IF EXISTS conversations_phone_jid_idx;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_account_phone_idx ON conversations (account_id, phone_jid);
CREATE INDEX IF NOT EXISTS leads_account_id_idx ON leads (account_id);
CREATE INDEX IF NOT EXISTS sellers_account_id_idx ON sellers (account_id);

-- Configurações de IA e visual passam a ser por conta (id = id da conta)
ALTER TABLE ai_settings ALTER COLUMN id TYPE varchar(64);
ALTER TABLE ai_settings ALTER COLUMN id DROP DEFAULT;
UPDATE ai_settings SET id = (SELECT id::text FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE id = 'default';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS scheduling_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS business_hours text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS reminder_message text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NOT NULL DEFAULT 0;

ALTER TABLE platform_settings ALTER COLUMN id TYPE varchar(64);
ALTER TABLE platform_settings ALTER COLUMN id DROP DEFAULT;
UPDATE platform_settings SET id = (SELECT id::text FROM accounts WHERE type = 'MASTER' LIMIT 1) WHERE id = 'default';

-- Agenda
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES sellers(id) ON DELETE SET NULL,
  title varchar(200) NOT NULL,
  notes text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  status varchar(12) NOT NULL DEFAULT 'SCHEDULED',
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_message text,
  reminder_minutes_before integer NOT NULL DEFAULT 0,
  reminder_sent_at timestamptz,
  reminder_error text,
  created_by varchar(10) NOT NULL DEFAULT 'HUMAN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_account_starts_idx ON appointments (account_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_lead_id_idx ON appointments (lead_id);

-- Mídia, assinatura, situação do WhatsApp e permissão de editar cards
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_name varchar(150);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wa_state varchar(20);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wa_phone varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wa_state_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wa_last_seen_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lead_edit boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS product_edit boolean NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS sign_messages boolean NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS alert_phone varchar(40);
CREATE INDEX IF NOT EXISTS messages_whatsapp_message_id_idx ON messages (whatsapp_message_id);

-- Catálogo de produtos
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_categories_account_idx ON product_categories (account_id);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  description text,
  price double precision,
  promo_price double precision,
  code varchar(60),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_account_idx ON products (account_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  data_url text NOT NULL,
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images (product_id);
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS label varchar(60);
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS availability varchar(10);
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS lead_time_days integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS availability varchar(10) NOT NULL DEFAULT 'READY';
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS installments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_period varchar(10) NOT NULL DEFAULT 'MONTH';
ALTER TABLE products ADD COLUMN IF NOT EXISTS setup_fee double precision;
ALTER TABLE products ADD COLUMN IF NOT EXISTS commitment_months integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS trial_days integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;

-- Funil com colunas personalizadas
CREATE TABLE IF NOT EXISTS funnel_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'CUSTOM',
  ai_rule text,
  color varchar(20),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funnel_columns_account_idx ON funnel_columns (account_id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES funnel_columns(id) ON DELETE SET NULL;

-- Áudio: ouvir (OpenAI) e responder por voz (ElevenLabs)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS openai_key_enc text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS eleven_key_enc text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS transcribe_audio boolean NOT NULL DEFAULT true;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS voice_replies boolean NOT NULL DEFAULT false;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS voice_id varchar(80);
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS voice_name varchar(120);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript text;

-- Instagram e Facebook (Meta)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel varchar(20) NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handle varchar(120);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_page_id varchar(40);
CREATE TABLE IF NOT EXISTS meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  page_id varchar(40) NOT NULL,
  page_name varchar(200),
  page_token_enc text NOT NULL,
  ig_user_id varchar(40),
  ig_username varchar(120),
  messenger_enabled boolean NOT NULL DEFAULT true,
  instagram_enabled boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'connected',
  last_error text,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_page_idx ON meta_connections (page_id);
CREATE INDEX IF NOT EXISTS meta_connections_account_idx ON meta_connections (account_id);
CREATE INDEX IF NOT EXISTS meta_connections_ig_idx ON meta_connections (ig_user_id);
CREATE TABLE IF NOT EXISTS meta_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payload_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Vários funis
CREATE TABLE IF NOT EXISTS funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funnels_account_idx ON funnels (account_id);
ALTER TABLE funnel_columns ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES funnels(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES funnels(id) ON DELETE SET NULL;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS funnel_id uuid;

-- Ações da IA
CREATE TABLE IF NOT EXISTS ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  kind varchar(12) NOT NULL DEFAULT 'INFO',
  instructions text,
  appointment_title varchar(120),
  appointment_minutes integer,
  column_id uuid REFERENCES funnel_columns(id) ON DELETE SET NULL,
  handoff boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_actions_account_idx ON ai_actions (account_id);
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS action_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS primary_action_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS action_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_action_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_action varchar(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_action_at timestamptz;

-- Chatbot (menus sem IA)
CREATE TABLE IF NOT EXISTS chatbots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  trigger varchar(20) NOT NULL DEFAULT 'START',
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  tag_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  skip_tag_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  channels jsonb NOT NULL DEFAULT '["WHATSAPP","INSTAGRAM","MESSENGER"]'::jsonb,
  restart_hours integer NOT NULL DEFAULT 24,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  fallback_message text,
  max_tries integer NOT NULL DEFAULT 2,
  after_fail varchar(10) NOT NULL DEFAULT 'HUMAN',
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chatbots_account_idx ON chatbots (account_id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES chatbots(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_step varchar(40);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_tries integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_ended_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_last_id uuid;

-- Estilo e ritmo da IA
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS style varchar(20) NOT NULL DEFAULT 'FRIENDLY';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS style_custom text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS reply_length varchar(10) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS emoji_level varchar(10) NOT NULL DEFAULT 'LOW';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS reply_speed varchar(10) NOT NULL DEFAULT 'NATURAL';

-- Vídeo dos produtos (arquivo no bucket)
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_key varchar(300);
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_bytes integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_seconds integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_key varchar(300);
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS offer_video boolean NOT NULL DEFAULT true;

-- Horário dos consultores (transferência fora do horário)
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS seller_hours jsonb;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS after_hours_message text;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS qualify jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualified_at timestamptz;

-- Recontato automático
CREATE TABLE IF NOT EXISTS followup_settings (
  id varchar(64) PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_count integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_last_at timestamptz;

-- Migrações que rodam uma única vez
CREATE TABLE IF NOT EXISTS app_migrations (key varchar(80) PRIMARY KEY, ran_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE key = 'grant-produtos-v1') THEN
    -- Menu novo "Produtos": libera para parceiros/clientes que já tinham Leads
    UPDATE accounts SET modules = modules || '["produtos"]'::jsonb
      WHERE type <> 'MASTER' AND modules ? 'leads' AND NOT modules ? 'produtos';
    INSERT INTO app_migrations (key) VALUES ('grant-produtos-v1');
  END IF;
END $$;
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
