# Construtor de Fluxo WhatsApp

Visual flow builder para automação de conversas no WhatsApp, com deploy em Railway.

## Arquitetura

**3 camadas (como no projeto de referência):**

1. **App Web (Next.js + Drizzle ORM)**
   - Builder visual (React Flow)
   - Cadastro e gerenciamento de fluxos
   - Dashboard com relatórios de vendas e execução

2. **Motor de Fluxo (Processo Separado)**
   - Mantém conexão WhatsApp viva (Baileys)
   - Interpreta fluxo salvo no banco
   - Executa blocos conforme conversa avança

3. **Banco Postgres**
   - Tabelas: flows, flow_blocks, flow_connections, conversations, messages, leads, etc.

## Setup Inicial

### Pré-requisitos
- Node.js ≥ 20.9.0
- PostgreSQL 14+
- npm ou yarn

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

Exemplo de `.DATABASE_URL`:
```
postgresql://user:password@localhost:5432/construtor_fluxo
```

### 3. Criar banco de dados
```bash
npm run db:migrate
```

### 4. Iniciar desenvolvimento
```bash
npm run dev
```

Acesse http://localhost:3000

## Estrutura de Pastas

```
src/
├── app/                           # Next.js App Router
│   ├── api/
│   │   ├── flows/                # CRUD de fluxos
│   │   ├── flows/[id]/blocks/   # Gerenciamento de blocos
│   │   └── dashboard/stats/      # Estatísticas de vendas e execução
│   ├── builder/                  # Página do builder (criar novo fluxo)
│   ├── builder/[id]/             # Editor visual (React Flow) — TODO
│   ├── flows/                    # Listagem de fluxos
│   └── page.tsx                  # Dashboard com estatísticas
├── db/
│   ├── client.ts                 # Cliente Drizzle
│   └── schema.ts                 # Schema Drizzle com todas as tabelas
├── lib/
│   ├── env.ts                    # Validação de variáveis de ambiente
│   └── services/
│       ├── flows/                # Lógica de fluxos — TODO
│       └── whatsapp/             # Integração WhatsApp — TODO
└── components/
    ├── builder/                  # Componentes do builder — TODO
    └── dashboard/                # Componentes do dashboard — TODO

scripts/
└── flow-engine-server.mts        # Motor de fluxo (processo separado) — TODO

drizzle/
└── (migrações geradas automaticamente)
```

## Fase de Implementação

### ✅ Fase 1: Fundação
- [x] Schema Drizzle com todas as tabelas
- [x] APIs CRUD de fluxos
- [x] Dashboard com estatísticas de vendas e execução
- [x] Listagem de fluxos
- [x] Formulário de criação de fluxo

### ✅ Fase 2: Builder Visual
- [x] Canvas com React Flow
- [x] Paleta de blocos (Texto, Imagem, Lista, Response Wait, Condition, End)
- [x] Arrastar e soltar blocos
- [x] Ligar blocos com linhas
- [x] Editar configuração de blocos
- [x] Painel de configuração dinâmico por tipo
- [x] Salvar fluxo com sincronização backend

### ✅ Fase 3: Motor de Fluxo
- [x] Servidor separado (flow-engine-server.mts) com Baileys
- [x] Conexão WhatsApp mantida viva
- [x] Interpretação e execução de blocos
- [x] Suporte a 10 tipos de blocos
- [x] Log de execução (flow_executions)
- [x] Gerenciamento de estado de conversa

## Dashboard

Acesso em http://localhost:3000 mostra:

**Vendas:**
- Total de vendas (R$)
- Deals fechados (quantidade)
- Ticket médio (R$)
- Total de leads

**Fluxos:**
- Fluxos ativos
- Conversas ativas
- Execuções hoje

**Gráficos:**
- Leads por estágio (progress bars)
- Últimas vendas fechadas (tabela)

## APIs

### Flows
```
GET /api/flows                  # Listar todos
POST /api/flows                 # Criar
GET /api/flows/[id]            # Obter específico com blocos e conexões
PATCH /api/flows/[id]          # Atualizar
DELETE /api/flows/[id]         # Deletar (cascata)
```

### Blocos
```
POST /api/flows/[id]/blocks    # Criar bloco
```

### Dashboard
```
GET /api/dashboard/stats       # Estatísticas (vendas, fluxos, leads)
```

## Tipos de Blocos

1. **START** — Início (root block)
2. **TEXT_MESSAGE** — Enviar texto
3. **IMAGE** — Enviar imagem
4. **VIDEO** — Enviar vídeo
5. **AUDIO** — Enviar áudio
6. **DOCUMENT** — Enviar documento
7. **LIST** — Enviar menu com opções
8. **RESPONSE_WAIT** — Aguardar resposta (ramificação)
9. **CONDITION** — Condição (if/else)
10. **END** — Encerrar fluxo

## Acionadores (Triggers)

1. **FIRST_MESSAGE** — Primeira mensagem
2. **KEYWORD** — Palavra-chave específica
3. **SCHEDULED** — Agendado

## Próximas Etapas

1. Implementar builder visual com React Flow
2. Criar componentes de edição de blocos
3. Implementar motor de fluxo (flow-engine-server.mts)
4. Integração com Baileys para WhatsApp
5. Deploy no Railway (3 serviços: web, motor, banco)

## Licença

ISC
