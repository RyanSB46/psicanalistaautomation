import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('clinic-brain-backend'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1d'),
  WEBHOOK_API_KEY: z.string().min(1),
  EVOLUTION_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().min(1),
  EVOLUTION_TIMEOUT_MS: z.coerce.number().default(5000),
  EVOLUTION_RETRY_ATTEMPTS: z.coerce.number().default(2),
  BOOKING_SITE_URL: z.string().url().default('http://localhost:5173'),
  SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  REMINDER_CHECK_INTERVAL_MS: z.coerce.number().default(60000),
  DEFAULT_TIMEZONE: z.string().default('America/Sao_Paulo'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid environment variables: ${issues}`)
}

export const env = parsed.data
