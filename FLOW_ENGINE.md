# Flow Engine — Motor de Execução de Fluxos WhatsApp

## O que é?

O **Flow Engine** é um servidor Node.js **separado** que:

1. **Mantém conexão WhatsApp viva** via Baileys
2. **Recebe mensagens** dos usuários
3. **Interpreta e executa blocos** do fluxo salvo no banco
4. **Envia respostas** automaticamente
5. **Registra execuções** para analytics

---

## Fluxo de Execução

```
┌─────────────────────────────────────────────────────┐
│ 1. MENSAGEM CHEGA                                   │
│    Usuário envia msg no WhatsApp → Baileys capta   │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 2. BUSCAR CONVERSA                                  │
│    Procura conversa do phoneJid no banco            │
│    Se não existe → Cria nova conversa              │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 3. PROCURAR FLUXO ATIVO                            │
│    SELECT conversation_states                      │
│    WHERE status = 'ACTIVE'                         │
│    Se não existe → startNewFlow (trigger)          │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 4. EXECUTAR BLOCO                                   │
│    Determina próximo bloco                         │
│    Executa lógica do tipo (TEXT, IMAGE, etc.)     │
│    Envia resposta                                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 5. REGISTRAR EXECUÇÃO                              │
│    INSERT INTO flow_executions                     │
│    Atualiza conversation_states.currentBlockId     │
└─────────────────────────────────────────────────────┘
```

---

## Tipos de Blocos Suportados

### 1. **START** ▶️
- Bloco inicial obrigatório
- Envia mensagem initial se configurada
- Transição: automática para próximo bloco

**Config:**
```json
{
  "message": "Olá! Como posso ajudar?"
}
```

### 2. **TEXT_MESSAGE** 💬
- Envia mensagem de texto
- Suporte a delay (espera antes de enviar)

**Config:**
```json
{
  "text": "Qual é o seu interesse?",
  "delay": 2
}
```

### 3. **IMAGE** 🖼️
- Envia imagem via URL

**Config:**
```json
{
  "imageUrl": "https://example.com/img.jpg",
  "caption": "Confira nosso produto"
}
```

### 4. **VIDEO** 🎬
- Envia vídeo via URL

**Config:**
```json
{
  "videoUrl": "https://example.com/video.mp4",
  "caption": "Demonstração"
}
```

### 5. **AUDIO** 🎵
- Envia áudio/nota de voz

**Config:**
```json
{
  "audioUrl": "https://example.com/audio.mp3"
}
```

### 6. **DOCUMENT** 📄
- Envia arquivo PDF, DOC, etc.

**Config:**
```json
{
  "documentUrl": "https://example.com/doc.pdf",
  "fileName": "Proposta.pdf"
}
```

### 7. **LIST** 📋
- Menu com opções (usuário escolhe uma)
- WhatsApp renderiza como botões

**Config:**
```json
{
  "title": "Qual serviço deseja?",
  "options": "Consultoria\nDesign\nDesen. Web"
}
```

### 8. **RESPONSE_WAIT** ⏳
- Marca que está aguardando resposta
- Próximo bloco = quando usuário responde

**Config:**
```json
{
  "prompt": "Por favor, digite sua resposta",
  "timeout": 60
}
```

### 9. **CONDITION** ❓
- Ramificação condicional
- Implementado nas **conexões** (ver abaixo)

**Config:**
```json
{
  "variable": "ultima_resposta",
  "operator": "equals",
  "value": "Consultoria"
}
```

### 10. **END** 🛑
- Encerra o fluxo
- Marca conversation_state como COMPLETED

**Config:**
```json
{
  "message": "Obrigado! Entraremos em contato em breve."
}
```

---

## Conexões e Ramificações

Conexões entre blocos podem ter **labels e condições**:

```typescript
{
  id: "conn_123",
  fromBlockId: "block_001",      // Bloco CONDITION
  toBlockId: "block_002",         // Bloco se SIM
  label: "SIM",
  conditionKey: "resposta",       // Variável a testar
  conditionValue: "Consultoria"   // Valor esperado
}
```

**Operadores suportados:**
- `equals` — Exato
- `notEquals` — Diferente
- `contains` — Contém
- `startsWith` — Começa com

---

## Variáveis de Contexto

Cada `conversation_state` tem um objeto `variables`:

```json
{
  "startedWith": "Olá",
  "name": "João",
  "email": "joao@example.com",
  "ultima_resposta": "Consultoria",
  "stage": "QUALIFIED"
}
```

Variáveis são preenchidas:
- Automaticamente (ex: `startedWith`)
- Por entrada do usuário (ex: `ultima_resposta`)
- Por integração com banco (ex: `stage`)

---

## Fila de Mensagens (Futura)

Atualmente, as mensagens são enviadas **imediatamente**. Para escalar:

```sql
-- Adicionar coluna
ALTER TABLE messages ADD COLUMN status VARCHAR(20) DEFAULT 'SENT';

-- Valores possíveis: QUEUED, SENT, FAILED, RETRYING
```

Flow Engine monitorará:
```sql
SELECT * FROM messages
WHERE status = 'QUEUED'
ORDER BY created_at ASC;
```

---

## Log de Execução

Toda execução é registrada em `flow_executions`:

```sql
SELECT 
  fe.id,
  b.type,
  b.config,
  fe.result,
  fe.executed_at
FROM flow_executions fe
JOIN flow_blocks b ON fe.block_id = b.id
WHERE fe.state_id = 'state_123'
ORDER BY fe.executed_at ASC;
```

**Resultado exemplo:**
```json
{
  "success": true,
  "messageId": "msg_12345",
  "duration_ms": 234
}
```

---

## Tratamento de Erros

Quando uma mensagem falha:

```json
{
  "success": false,
  "error": "Failed to send media: URL not reachable",
  "blockId": "block_123",
  "timestamp": "2024-09-21T21:00:00Z"
}
```

Flow Engine:
1. Registra o erro em `flow_executions`
2. Marca `conversation_state` como `FAILED`
3. **NÃO** continua fluxo (pausa até intervenção)

---

## Triggers (Acionadores)

### FIRST_MESSAGE
Dispara fluxo quando usuário envia primeira mensagem.

```sql
SELECT * FROM flow_triggers
WHERE type = 'FIRST_MESSAGE' AND enabled = true
ORDER BY flow.priority ASC;
```

### KEYWORD
Dispara quando mensagem contém palavra-chave.

```json
{
  "type": "KEYWORD",
  "config": { "keywords": ["consultoria", "dúvida", "ajuda"] },
  "enabled": true
}
```

### SCHEDULED
Dispara em horário agendado (ex: enviar bom dia).

```json
{
  "type": "SCHEDULED",
  "config": { "time": "08:00", "timezone": "America/Sao_Paulo" },
  "enabled": true
}
```

---

## Integração com Leads

Quando um lead está associado à conversa:

```sql
UPDATE leads
SET stage = 'QUALIFIED', dealValue = 5000, closed = true
WHERE conversation_id = 'conv_123';
```

**Fluxo pode:**
- Ler estágio do lead
- Atualizar dealValue
- Marcar como CLOSED_WON

---

## Exemplo Completo

### Fluxo: "Venda de Consultoria"

```
[START]
  ↓ "Olá! Oferecemos consultoria estratégica"
[TEXT_MESSAGE]
  ↓ "Qual é seu interesse?"
[LIST] (Consultoria / Design / Dev)
  ↓ (usuário clica em "Consultoria")
[CONDITION] (resposta == "Consultoria")
  ├─ SIM → [TEXT_MESSAGE] "Ótimo! Vou transferir..."
  │         ↓
  │        [END] (transferir para atendente)
  │
  └─ NÃO → [TEXT_MESSAGE] "Certo, vou transferir para outra área..."
            ↓
           [END]
```

### Banco de Dados

**flows:**
```sql
INSERT INTO flows (id, name, description, enabled, phone_number, priority)
VALUES ('flow_001', 'Venda Consultoria', '...', true, '5511999999999', 0);
```

**flow_blocks:**
```sql
INSERT INTO flow_blocks (id, flow_id, type, config, position_x, position_y)
VALUES 
  ('b_001', 'flow_001', 'START', '{"message":"Olá!"}', 100, 100),
  ('b_002', 'flow_001', 'LIST', '{"options":"Consultoria\nDesign"}', 100, 200),
  ('b_003', 'flow_001', 'CONDITION', '{"variable":"resposta"}', 100, 300),
  ('b_004', 'flow_001', 'TEXT_MESSAGE', '{"text":"Transferindo..."}', 50, 400),
  ('b_005', 'flow_001', 'END', '{}', 150, 400);
```

**flow_connections:**
```sql
INSERT INTO flow_connections (id, flow_id, from_block_id, to_block_id, label)
VALUES
  ('c_001', 'flow_001', 'b_001', 'b_002', ''),
  ('c_002', 'flow_001', 'b_002', 'b_003', ''),
  ('c_003', 'flow_001', 'b_003', 'b_004', 'SIM'),
  ('c_004', 'flow_001', 'b_003', 'b_005', 'NÃO'),
  ('c_005', 'flow_001', 'b_004', 'b_005', '');
```

---

## Monitoramento

### Logs em Tempo Real

```bash
# Escutar logs do Flow Engine
railway logs -s flow-engine -f
```

### Métricas

Queries úteis:

```sql
-- Fluxos mais executados
SELECT f.name, COUNT(fe.id) as executions
FROM flow_executions fe
JOIN conversation_states cs ON fe.state_id = cs.id
JOIN flows f ON cs.flow_id = f.id
GROUP BY f.id, f.name
ORDER BY executions DESC;

-- Taxa de sucesso
SELECT 
  (COUNT(CASE WHEN result->>'success' = 'true' THEN 1 END)::float / COUNT(*) * 100)::int as success_rate
FROM flow_executions;

-- Tempo médio de execução
SELECT 
  (avg(EXTRACT(EPOCH FROM (executed_at - created_at))) * 1000)::int as avg_time_ms
FROM flow_executions;
```

---

## Troubleshooting

### "Socket not connected"
- Flow Engine não conectou ao WhatsApp
- Solução: Aguardar conexão ou rescanear QR Code

### "Block not found"
- Bloco foi deletado mas conexão ainda existe
- Solução: Limpar conexões órfãs

### "Timeout"
- Banco de dados está lento
- Solução: Aumentar pool size ou otimizar queries

### "Mensagem não é entregue"
- URL de mídia inválida ou indisponível
- Solução: Verificar URLs de imagens/vídeos

---

## Próximas Melhorias

- [ ] Implementar fila com Bull/BullMQ
- [ ] Suportar IA (Claude API) para mensagens dinâmicas
- [ ] Webhook callbacks
- [ ] Rate limiting por número
- [ ] Analytics avançado (CRM integration)
- [ ] Teste de fluxo na web (simulation mode)
