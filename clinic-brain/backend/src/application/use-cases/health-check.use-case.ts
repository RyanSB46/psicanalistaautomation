export type HealthCheckResult = {
  status: 'ok'
  service: string
  timestamp: string
}

export function executeHealthCheck(serviceName: string): HealthCheckResult {
  return {
    status: 'ok',
    service: serviceName,
    timestamp: new Date().toISOString(),
  }
}
