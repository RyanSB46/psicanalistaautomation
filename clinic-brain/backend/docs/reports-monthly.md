# Relatórios mensais (Prompt 9)

## Endpoint

- `GET /api/reports/monthly`
- Requer autenticação (`Bearer token`)

## Query params

- `from` (ISO date opcional)
- `to` (ISO date opcional)

Sem parâmetros, usa o mês atual (`início do mês` até `início do próximo mês`).

## Resposta

```json
{
  "period": {
    "from": "2026-02-01T00:00:00.000Z",
    "to": "2026-03-01T00:00:00.000Z"
  },
  "totalConsultations": 20,
  "confirmed": 14,
  "canceled": 3,
  "missed": 2,
  "attendanceRate": 70,
  "estimatedRevenueCents": 252000,
  "activePatients": 34,
  "inactivePatients": 8,
  "summaryByStatus": {
    "AGENDADO": 1,
    "CONFIRMADO": 14,
    "CANCELADO": 3,
    "FALTOU": 2,
    "REMARCADO": 0
  },
  "detailedAppointments": [
    {
      "id": "apt_123",
      "startsAt": "2026-02-10T14:00:00.000Z",
      "endsAt": "2026-02-10T14:50:00.000Z",
      "status": "CONFIRMADO",
      "notes": "Paciente chegou 5 minutos antes",
      "patient": {
        "id": "pat_456",
        "name": "Maria Silva",
        "phoneNumber": "+5511999999999"
      }
    }
  ]
}
```

## Métricas calculadas

- `totalConsultations`: total de consultas no período
- `confirmed`: consultas confirmadas no período
- `canceled`: consultas canceladas no período
- `missed`: faltas no período
- `attendanceRate`: `(confirmed / totalConsultations) * 100`
- `estimatedRevenueCents`: `confirmed * consultationFeeCents`
- `activePatients`: pacientes com status `ATIVO`
- `inactivePatients`: pacientes com status `INATIVO`
- `summaryByStatus`: contagem detalhada por status de agendamento
- `detailedAppointments`: lista completa de consultas do período para análise detalhada e exportação no frontend
