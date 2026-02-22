# Prompt 11 — Validação final

## 1) Checklist de funcionalidades implementadas

### Base e arquitetura
- [x] Monorepo com backend/frontend
- [x] Backend Node.js + TypeScript + Express
- [x] Frontend React + TypeScript + Vite
- [x] PostgreSQL + Prisma + migrations + seed
- [x] Estrutura em camadas (domain/application/infra/interfaces)

### Segurança e observabilidade
- [x] Validação de payload com Zod
- [x] Hash de senha com bcrypt
- [x] JWT + middleware auth + tenant scope
- [x] Helmet, CORS, Rate limit
- [x] Logs estruturados com pino e requestId
- [x] Health (`/api/health`) e Readiness (`/api/readiness`)

### Agenda
- [x] Criar agendamento
- [x] Remarcar
- [x] Cancelar
- [x] Confirmar presença
- [x] Constraint anti-conflito por horário/profissional
- [x] Tratamento de concorrência com transação

### WhatsApp / chatbot
- [x] Webhook Evolution (`/webhook` e compatibilidade em `/api/webhook/evolution`)
- [x] Validação de API key de webhook
- [x] Processamento apenas de mensagem de texto
- [x] Persistência de interação com idempotência por `message_id`
- [x] Máquina de estados conectada à sessão
- [x] Fluxo da doutora com opções de marcar/remarcar/cancelar/conversar

### Jobs
- [x] Reminder D-1 (08:00) com timezone
- [x] Reminder 2h antes
- [x] Registro de envio em interações
- [x] Idempotência para evitar duplicidade de reminders

### Frontend MVP
- [x] Login
- [x] Dashboard com métricas
- [x] Agenda (lista + calendário simples)
- [x] Pacientes (cadastro + listagem)
- [x] Configurações de mensagens padrão
- [x] Relatórios com filtro por período

### Testes mínimos
- [x] Unit da state machine
- [x] Unit/serviço de regra de agenda (corrida)
- [x] Integração de auth
- [x] Integração de agendamento
- [x] Integração de webhook
- [x] `npm test` passando

## 2) Gaps restantes

- Cobertura de testes ainda sem cenários de erro avançados (timeouts externos, indisponibilidade parcial, etc.)
- Ausência de testes E2E do frontend
- Falta de RBAC/perfis além do profissional autenticado
- Falta de métricas técnicas (latência p95, taxa de erro por rota) em ferramenta externa
- Chaves de integração ainda sem fluxo de rotação automatizada

## 3) Próximos 7 dias de evolução técnica

### Dia 1
- Criar pipeline CI para `lint`, `build`, `test` (backend e frontend)

### Dia 2
- Adicionar testes de falha para webhook e retries de integração Evolution

### Dia 3
- Expandir testes de agenda (casos de fronteira, timezone e remarcação em cadeia)

### Dia 4
- Implementar testes E2E do frontend (login, agenda, pacientes, relatórios)

### Dia 5
- Melhorar monitoramento com métricas de aplicação (erro, latência, throughput)

### Dia 6
- Hardening de secrets e política de rotação (JWT, webhook, API externa)

### Dia 7
- Revisão de prontidão para deploy: runbook, rollback e checklist operacional
