import type { HealthStatus } from '../../domain/models/health-status'

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export async function fetchHealthStatus(): Promise<HealthStatus> {
  const response = await fetch(`${apiBaseUrl}/health`)

  if (!response.ok) {
    throw new Error('Erro ao consultar status do backend')
  }

  return response.json() as Promise<HealthStatus>
}
