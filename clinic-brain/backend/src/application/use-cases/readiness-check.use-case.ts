import { prisma } from '../../infra/database/prisma/client'

export type ReadinessCheckResult = {
  status: 'ready' | 'not_ready'
  service: string
  timestamp: string
  checks: {
    database: 'ok' | 'error'
  }
}

export async function executeReadinessCheck(serviceName: string): Promise<ReadinessCheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`

    return {
      status: 'ready',
      service: serviceName,
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
      },
    }
  } catch {
    return {
      status: 'not_ready',
      service: serviceName,
      timestamp: new Date().toISOString(),
      checks: {
        database: 'error',
      },
    }
  }
}
