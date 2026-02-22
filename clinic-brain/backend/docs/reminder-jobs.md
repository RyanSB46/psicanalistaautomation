# Reminder Jobs (Prompt 7)

## Agendadores implementados

- D-1 às 08:00 no timezone da profissional (ou timezone das configurações)
- Lembrete final 2h antes da consulta

## Regras aplicadas

- Considera apenas agendamentos com status `AGENDADO` ou `CONFIRMADO`
- Respeita `lembrete_d1_ativo` e `lembrete_2h_ativo` em `configuracoes`
- Usa timezone de `configuracoes.timezone` com fallback para `profissionais.timezone`
- Cada envio cria interação `BOT` vinculada ao `appointmentId`

## Idempotência

- D-1: `externalMessageId = reminder:d1:{appointmentId}:{yyyymmdd}`
- 2h: `externalMessageId = reminder:2h:{appointmentId}`
- O sistema verifica existência prévia de interação com esse `externalMessageId` antes de enviar

## Registro de envio e resposta

- Envio: registrado como `interacoes.tipo = BOT`
- Resposta do paciente: já registrada no fluxo de webhook (`interacoes.tipo = PACIENTE`)

## Variáveis de ambiente

- `SCHEDULER_ENABLED` (default `true`)
- `REMINDER_CHECK_INTERVAL_MS` (default `60000`)
- `DEFAULT_TIMEZONE` (default `America/Sao_Paulo`)
