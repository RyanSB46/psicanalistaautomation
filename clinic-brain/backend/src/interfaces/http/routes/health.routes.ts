import { Router } from 'express'
import { executeHealthCheck } from '../../../application/use-cases/health-check.use-case'
import { executeReadinessCheck } from '../../../application/use-cases/readiness-check.use-case'
import { env } from '../../../infra/config/env'

export const healthRoutes = Router()

healthRoutes.get('/health', (_request, response) => {
  const result = executeHealthCheck(env.APP_NAME)
  response.status(200).json(result)
})

healthRoutes.get('/readiness', async (_request, response) => {
  const result = await executeReadinessCheck(env.APP_NAME)
  response.status(result.status === 'ready' ? 200 : 503).json(result)
})
