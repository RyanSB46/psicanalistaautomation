# Webhook Evolution API

## Endpoint

- Padrão recomendado: `POST /webhook`
- Compatibilidade legada: `POST /api/webhook/evolution`

## Segurança

Header obrigatório:

```txt
x-webhook-api-key: <WEBHOOK_API_KEY>
```

## Comportamento

- Eventos que não são de mensagem de texto são ignorados com `202`.
- Quando texto é detectado, o serviço extrai:
  - `phoneNumber`
  - `text`
  - `messageId`
- Eventos duplicados (mesmo `messageId` para o mesmo profissional) são ignorados com `202`.
- O backend persiste a interação em `interacoes` e atualiza/cria sessão em `sessoes_whatsapp`.

## Exemplo (evento de texto)

### Request

```json
{
  "event": "messages.upsert",
  "data": {
    "key": {
      "id": "ABCD1234",
      "remoteJid": "5527996087528@s.whatsapp.net"
    },
    "message": {
      "conversation": "Quero remarcar minha sessão"
    },
    "messageType": "conversation"
  }
}
```

### Response 200

```json
{
  "status": "processed",
  "payload": {
    "phoneNumber": "5527996087528",
    "text": "Quero remarcar minha sessão",
    "messageId": "ABCD1234"
  }
}
```

## Exemplo (evento ignorado)

### Response 202

```json
{
  "status": "ignored",
  "reason": "Evento não suportado"
}
```
