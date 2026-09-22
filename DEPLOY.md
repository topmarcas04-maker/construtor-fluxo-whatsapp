# Deploy no Railway — Construtor de Fluxo WhatsApp

## Arquitetura

O projeto consiste em **3 serviços independentes** rodando no Railway:

```
┌─────────────────────────────────────────┐
│   1. WEB APP (Next.js)                  │
│   - Dashboard & Builder Visual          │
│   - APIs REST para gerenciar fluxos    │
│   - Port: 3000                          │
└─────────────────────────────────────────┘
           ↕️ (via banco de dados)
┌─────────────────────────────────────────┐
│   2. FLOW ENGINE (Node.js/Baileys)      │
│   - Conexão WhatsApp                    │
│   - Execução de fluxos                  │
│   - Monitoramento de mensagens          │
│   - Port: 3001                          │
└─────────────────────────────────────────┘
           ↕️ (via banco de dados)
┌─────────────────────────────────────────┐
│   3. DATABASE (PostgreSQL)              │
│   - Todas as tabelas                    │
│   - Fila de mensagens                   │
│   - Logs de execução                    │
└─────────────────────────────────────────┘
```

---

## Pré-requisitos no Railway

1. **Conta Railway** — https://railway.app
2. **Projeto PostgreSQL** — Criar banco de dados
3. **Environment Variables** — Configurar no projeto

---

## Step 1: Preparar o Repositório

```bash
# 1. Fazer commit de todos os arquivos
git add .
git commit -m "Phase 3: Flow Engine implementation"

# 2. Fazer push para GitHub (se usando GitHub)
git push origin main
```

---

## Step 2: Criar PostgreSQL no Railway

1. Acessar https://railway.app
2. Novo Projeto → Database → PostgreSQL
3. Conectar para obter `DATABASE_URL`:
   ```
   postgresql://user:password@host:5432/db_name
   ```
4. Copiar a URL completa

---

## Step 3: Configurar Variáveis de Ambiente

No Railway, ir em **Project Settings** → **Variables** e adicionar:

```env
# Banco de dados
DATABASE_URL=postgresql://user:password@host:5432/db_name

# WhatsApp
WHATSAPP_PHONE_NUMBER=5511999999999  # Número de teste (opcional)

# Flow Engine
FLOW_ENGINE_PORT=3001
NODE_ENV=production

# Next.js
NEXT_PUBLIC_API_URL=https://seu-dominio.railway.app
```

---

## Step 4: Deploy da Web App

### Opção A: Via GitHub (Recomendado)

1. Conectar repositório GitHub ao projeto Railway
2. Branch: `main`
3. Railway automaticamente fará build e deploy

### Opção B: Via CLI

```bash
# Instalar CLI do Railway
npm install -g @railway/cli

# Fazer login
railway login

# Fazer deploy
railway up
```

**Configurar Build Command:**
```bash
npm run build
```

**Configurar Start Command:**
```bash
npm run start
```

---

## Step 5: Deploy do Flow Engine

### Adicionar como Novo Serviço no Railway

1. **Novo Serviço** → "Dockerfile"
2. Criar `Dockerfile` na raiz do projeto:

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "flow:engine"]
```

3. **Railway** vai detectar e fazer deploy automaticamente

---

## Step 6: Rodando as Migrações

Após o banco estar criado, rodar:

```bash
# Via SSH no Railway (ou localmente)
npm run db:migrate
```

Ou via CLI:

```bash
railway run npm run db:migrate
```

---

## Step 7: Conectar Serviços

No Dashboard do Railway:

1. **Web App** → Connect → Database
2. **Flow Engine** → Connect → Database

As variáveis `DATABASE_URL` serão injetadas automaticamente.

---

## Step 8: Verificar Logs

### Web App
```bash
railway logs -s web-app
```

### Flow Engine
```bash
railway logs -s flow-engine
```

---

## Monitoramento

### Checklist de Verificação

- [ ] Web app rodando em `https://seu-dominio.railway.app`
- [ ] Flow engine conectado ao WhatsApp (gera QR Code nos logs)
- [ ] Database acessível por ambos serviços
- [ ] Dashboard carregando (http://localhost:3000)
- [ ] Fluxos salvando corretamente
- [ ] Mensagens sendo enviadas via WhatsApp

### Troubleshooting

**"DATABASE_URL não está definida"**
```bash
railway link
```

**"Conexão WhatsApp falhando"**
- Verificar logs do Flow Engine
- Escanear QR Code novamente (arquivo `auth_info_baileys` pode estar corrompido)

**"Timeout ao criar fluxo"**
- Verificar Pool de conexões PostgreSQL
- Aumentar `max_connections` se necessário

---

## Variáveis de Ambiente Completas

```env
# ===== DATABASE =====
DATABASE_URL=postgresql://user:password@host:5432/db_name

# ===== WHATSAPP =====
# Número padrão para testar (será substituído por QR Code)
WHATSAPP_PHONE_NUMBER=5511999999999

# ===== SERVER =====
FLOW_ENGINE_PORT=3001
NODE_ENV=production

# ===== NEXT.JS =====
NEXT_PUBLIC_API_URL=https://seu-dominio.railway.app
```

---

## Manutenção

### Backup do Banco

```bash
# Exportar backup
pg_dump $DATABASE_URL > backup.sql

# Restaurar backup
psql $DATABASE_URL < backup.sql
```

### Limpar Auth WhatsApp

Se precisar reconectar ao WhatsApp:

```bash
# Remover pasta de autenticação
rm -rf auth_info_baileys

# Flow Engine vai gerar novo QR Code
railway restart -s flow-engine
```

### Monitorar Execuções

Verificar tabela `flow_executions`:

```sql
SELECT * FROM flow_executions
ORDER BY executed_at DESC
LIMIT 10;
```

---

## Escalabilidade Futura

Para escalar:

1. **Múltiplas instâncias do Flow Engine** — Usar worker queues (Bull, etc.)
2. **Redis Cache** — Para otimizar queries
3. **Separar lógica de Baileys** — Serviço dedicado de WhatsApp

---

## Documentação Extra

- Drizzle ORM: https://orm.drizzle.team/
- Baileys: https://github.com/WhiskeySockets/Baileys
- Railway: https://docs.railway.app/
- Next.js Deployment: https://nextjs.org/docs/deployment

---

## Suporte

Para questões:
1. Verificar logs: `railway logs -s [service]`
2. Verificar status no Railway Dashboard
3. Revisar .env.local com DATABASE_URL correto
