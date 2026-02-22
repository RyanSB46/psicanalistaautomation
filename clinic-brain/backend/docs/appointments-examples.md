# Exemplos de Request/Response - Agenda

## POST /api/appointments

### Headers

```txt
Authorization: Bearer <jwt>
```

### Request

```json
{
  "patientId": "cmlpatient001",
  "startsAt": "2026-02-20T15:00:00-03:00",
  "endsAt": "2026-02-20T15:50:00-03:00",
  "notes": "Primeira sessão"
}
```

### Response 201

```json
{
  "id": "cmlapp001",
  "professionalId": "cmlprof001",
  "patientId": "cmlpatient001",
  "startsAt": "2026-02-20T18:00:00.000Z",
  "endsAt": "2026-02-20T18:50:00.000Z",
  "status": "AGENDADO"
}
```

## PATCH /api/appointments/:id/reschedule

### Request

```json
{
  "startsAt": "2026-02-21T15:00:00-03:00",
  "endsAt": "2026-02-21T15:50:00-03:00"
}
```

### Response 200

```json
{
  "oldAppointmentId": "cmlapp001",
  "newAppointmentId": "cmlapp002"
}
```

## PATCH /api/appointments/:id/cancel

### Response 200

```json
{
  "id": "cmlapp001",
  "status": "CANCELADO"
}
```

## PATCH /api/appointments/:id/confirm-presence

### Response 200

```json
{
  "id": "cmlapp001",
  "status": "CONFIRMADO"
}
```
