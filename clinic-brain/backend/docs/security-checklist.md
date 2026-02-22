# Checklist de Segurança e Observabilidade (Prompt 10)

## Controles aplicados no backend

- `helmet` habilitado para headers de segurança
- `cors` com origem configurável (`CORS_ORIGIN`)
- `express-rate-limit` para proteção básica contra abuso
- Logs estruturados com `pino` + `pino-http`
- `requestId` automático por requisição (`x-request-id`)
- Tratamento global de erros com resposta padronizada e `requestId`
- Health check em `GET /api/health`
- Readiness check com banco em `GET /api/readiness`
- Validação obrigatória de variáveis de ambiente na inicialização (`env.ts`)

## Checklist ambiente local

- [ ] Usar `JWT_SECRET` forte (mínimo 32 chars no `.env`)
- [ ] Não usar API keys reais em commits
- [ ] Validar `CORS_ORIGIN` para o frontend local
- [ ] Rodar `npm run build` antes de subir ambiente
- [ ] Verificar `GET /api/health` e `GET /api/readiness`
- [ ] Conferir logs com `requestId` em erros críticos

## Checklist ambiente VPS

- [ ] Rodar backend atrás de reverse proxy HTTPS
- [ ] Restringir portas públicas (apenas 80/443 externas)
- [ ] Configurar segredos via variáveis de ambiente do servidor
- [ ] Definir `NODE_ENV=production`
- [ ] Restringir `CORS_ORIGIN` para domínio oficial do frontend
- [ ] Habilitar rotação de logs
- [ ] Monitorar endpoints `/api/health` e `/api/readiness`
- [ ] Política de backup regular do PostgreSQL
- [ ] Rotacionar `JWT_SECRET`, `WEBHOOK_API_KEY` e `EVOLUTION_API_KEY` periodicamente
