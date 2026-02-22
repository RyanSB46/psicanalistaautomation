import { NextFunction, Request, Response } from 'express'
import { env } from '../../../infra/config/env'

function extractAuthorizationToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null
  }

  const [scheme, value] = authorizationHeader.split(' ')

  if (!value) {
    return authorizationHeader
  }

  if (scheme.toLowerCase() === 'bearer' || scheme.toLowerCase() === 'apikey') {
    return value
  }

  return value
}

function firstStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return null
}

export function webhookApiKeyMiddleware(request: Request, response: Response, next: NextFunction) {
  const candidates = [
    firstStringValue(request.headers['x-webhook-api-key']),
    firstStringValue(request.headers['apikey']),
    firstStringValue(request.headers['x-api-key']),
    extractAuthorizationToken(firstStringValue(request.headers.authorization) ?? undefined),
    typeof request.query.apikey === 'string' ? request.query.apikey : null,
    typeof request.query.webhookApiKey === 'string' ? request.query.webhookApiKey : null,
    typeof request.body?.apikey === 'string' ? request.body.apikey : null,
    typeof request.body?.webhookApiKey === 'string' ? request.body.webhookApiKey : null,
  ]

  const apiKey = candidates.find((item) => typeof item === 'string' && item.length > 0)

  if (!apiKey || apiKey !== env.WEBHOOK_API_KEY) {
    return response.status(401).json({
      message: 'Webhook API key inválida',
    })
  }

  return next()
}
