import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import pino from 'pino'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { env } from '../../infra/config/env'
import { appointmentsRoutes } from './routes/appointments.routes'
import { errorHandler } from './middlewares/error-handler'
import { authRoutes } from './routes/auth.routes'
import { healthRoutes } from './routes/health.routes'
import { webhookRoutes } from './routes/webhook.routes'
import { dashboardRoutes } from './routes/dashboard.routes'
import { patientsRoutes } from './routes/patients.routes'
import { settingsRoutes } from './routes/settings.routes'
import { reportsRoutes } from './routes/reports.routes'
import { patientPortalRoutes } from './routes/patient-portal.routes'
import { patientRequestsRoutes } from './routes/patient-requests.routes'

const detailedLogFilePath = path.join(process.cwd(), 'logs', 'backend-detalhado.log')

const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : env.LOG_LEVEL,
  transport: {
    targets:
      env.NODE_ENV === 'development'
        ? [
            {
              target: 'pino-pretty',
              level: env.LOG_LEVEL,
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                singleLine: true,
                ignore: 'pid,hostname,req.headers,res.headers',
              },
            },
            {
              target: 'pino/file',
              level: 'debug',
              options: {
                destination: detailedLogFilePath,
                mkdir: true,
              },
            },
          ]
        : [
            {
              target: 'pino/file',
              level: env.LOG_LEVEL,
              options: {
                destination: detailedLogFilePath,
                mkdir: true,
              },
            },
          ],
  },
})
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim())

function isHealthcheckRequest(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  return url.includes('/health')
}

export const app = express()

app.use(
  pinoHttp({
    logger,
    quietReqLogger: true,
    autoLogging: {
      ignore: (request) => isHealthcheckRequest(request.url),
    },
    customSuccessMessage: (request, response) => `${request.method} ${request.url} -> ${response.statusCode}`,
    customErrorMessage: (request, response) => `${request.method} ${request.url} -> ${response.statusCode}`,
    customLogLevel: (request, response, error) => {
      if (error || response.statusCode >= 500) {
        return 'error'
      }

      if (response.statusCode >= 400) {
        return 'warn'
      }

      return 'info'
    },
    genReqId: (request, response) => {
      const incomingId = request.headers['x-request-id']
      const requestId =
        typeof incomingId === 'string' && incomingId.trim().length > 0 ? incomingId : randomUUID()

      response.setHeader('x-request-id', requestId)
      return requestId
    },
  }),
)
app.use(helmet())
app.use(
  cors({
    origin: (origin, callback) => {
      if (env.NODE_ENV === 'development') {
        callback(null, true)
        return
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('CORS origin not allowed'))
    },
  }),
)
app.use(express.json())
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  }),
)

app.use(env.API_PREFIX, healthRoutes)
app.use(env.API_PREFIX, authRoutes)
app.use(`${env.API_PREFIX}/appointments`, appointmentsRoutes)
app.use(env.API_PREFIX, dashboardRoutes)
app.use(env.API_PREFIX, patientsRoutes)
app.use(env.API_PREFIX, settingsRoutes)
app.use(env.API_PREFIX, reportsRoutes)
app.use(env.API_PREFIX, patientPortalRoutes)
app.use(env.API_PREFIX, patientRequestsRoutes)
app.use(env.API_PREFIX, webhookRoutes)
app.use(webhookRoutes)
app.use(errorHandler)
