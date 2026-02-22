import { NextFunction, Request, Response, Router } from 'express'
import { processEvolutionWebhook } from '../../../application/services/evolution/process-evolution-webhook.service'
import { webhookApiKeyMiddleware } from '../middlewares/webhook-api-key.middleware'

export const webhookRoutes = Router()

async function handleEvolutionWebhook(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await processEvolutionWebhook(request.body)

    if (result.ignored) {
      return response.status(202).json({
        status: 'ignored',
        reason: result.reason,
        payload: result.payload,
      })
    }

    return response.status(200).json({
      status: 'processed',
      payload: result.payload,
    })
  } catch (error) {
    return next(error)
  }
}

webhookRoutes.post('/webhook/evolution', webhookApiKeyMiddleware, async (request, response, next) => {
  return handleEvolutionWebhook(request, response, next)
})

webhookRoutes.post('/webhook', webhookApiKeyMiddleware, async (request, response, next) => {
  return handleEvolutionWebhook(request, response, next)
})
