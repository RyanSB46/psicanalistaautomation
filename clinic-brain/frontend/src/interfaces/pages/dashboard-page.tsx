import { useQuery } from '@tanstack/react-query'
import { fetchDashboardOverview } from '../../application/services/clinic-api'
import { ErrorState, LoadingState } from '../components/feedback-states'

export function DashboardPage() {
  const overviewQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: fetchDashboardOverview,
  })

  if (overviewQuery.isLoading) {
    return <LoadingState message="Carregando métricas..." />
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        message={overviewQuery.error.message}
        onRetry={() => {
          void overviewQuery.refetch()
        }}
      />
    )
  }

  const data = overviewQuery.data

  if (!data) {
    return <LoadingState />
  }

  return (
    <section>
      <div className="metrics-grid">
        <article className="card metric-card">
          <h3>Total de pacientes</h3>
          <strong>{data.totalPatients}</strong>
        </article>

        <article className="card metric-card">
          <h3>Pacientes ativos</h3>
          <strong>{data.activePatients}</strong>
        </article>

        <article className="card metric-card">
          <h3>Consultas do mês</h3>
          <strong>{data.monthAppointments}</strong>
        </article>

        <article className="card metric-card">
          <h3>Próximas consultas</h3>
          <strong>{data.upcomingAppointments}</strong>
        </article>

        <article className="card metric-card">
          <h3>Cancelamentos no mês</h3>
          <strong>{data.canceledAppointments}</strong>
        </article>
      </div>
    </section>
  )
}
