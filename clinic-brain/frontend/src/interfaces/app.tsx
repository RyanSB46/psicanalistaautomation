import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'
import { AgendaPage } from './pages/agenda-page'
import { PatientsPage } from './pages/patients-page'
import { SettingsPage } from './pages/settings-page'
import { ReportsPage } from './pages/reports-page'
import { PatientPortalPage } from './pages/patient-portal-page'
import { PatientRequestsPage } from './pages/patient-requests-page'
import { clearAccessToken, getAccessToken, setAccessToken } from '../shared/auth/token-storage'
import {
  DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
  fetchSettingsFeatures,
  type ProfessionalFeatureFlags,
} from '../application/services/clinic-api'

type SectionKey = 'dashboard' | 'agenda' | 'patients' | 'reports' | 'requests' | 'settings'

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'patients', label: 'Pacientes' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'requests', label: 'Solicitações' },
  { key: 'settings', label: 'Configurações' },
]

const sectionFeatureMap: Record<SectionKey, keyof ProfessionalFeatureFlags> = {
  dashboard: 'dashboardEnabled',
  agenda: 'agendaEnabled',
  patients: 'patientsEnabled',
  reports: 'reportsEnabled',
  requests: 'requestsEnabled',
  settings: 'settingsEnabled',
}

function getAuthRole(token: string | null): 'PROFESSIONAL' | 'ADMIN' | null {
  if (!token) {
    return null
  }

  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string
    }

    if (payload.role === 'ADMIN') {
      return 'ADMIN'
    }

    return 'PROFESSIONAL'
  } catch {
    return null
  }
}

export function ClinicApp() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const patientPortalMatch = pathname.match(/^\/p\/([^/]+)$/)

  const [token, setToken] = useState<string | null>(getAccessToken())
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard')
  const authRole = useMemo(() => getAuthRole(token), [token])

  const featuresQuery = useQuery({
    queryKey: ['settings-features'],
    queryFn: fetchSettingsFeatures,
    enabled: Boolean(token) && authRole === 'PROFESSIONAL',
  })

  const featureFlags = featuresQuery.data ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS

  const availableSections = useMemo(
    () => sections.filter((section) => featureFlags[sectionFeatureMap[section.key]]),
    [featureFlags],
  )

  useEffect(() => {
    if (authRole !== 'PROFESSIONAL') {
      return
    }

    if (availableSections.length === 0) {
      return
    }

    if (!availableSections.some((section) => section.key === activeSection)) {
      setActiveSection(availableSections[0].key)
    }
  }, [activeSection, authRole, availableSections])

  const title = useMemo(() => {
    const current = availableSections.find((section) => section.key === activeSection)
    return current?.label ?? 'Dashboard'
  }, [activeSection, availableSections])

  if (patientPortalMatch) {
    return <PatientPortalPage professionalSlug={decodeURIComponent(patientPortalMatch[1])} />
  }

  if (!token) {
    return (
      <LoginPage
        onLoginSuccess={(accessToken) => {
          setAccessToken(accessToken)
          setToken(accessToken)
        }}
      />
    )
  }

  if (authRole === 'ADMIN') {
    return (
      <div className="layout-root">
        <aside className="sidebar">
          <h1 className="sidebar-title">Clinic Brain</h1>
          <p className="sidebar-subtitle">Painel admin técnico</p>

          <button
            type="button"
            className="logout-button"
            onClick={() => {
              clearAccessToken()
              setToken(null)
            }}
          >
            Sair
          </button>
        </aside>

        <main className="content-area">
          <header className="content-header">
            <h2>Admin técnico</h2>
          </header>

          <section className="card">
            <p className="muted-text">Login de admin autenticado com sucesso.</p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="layout-root">
      <aside className="sidebar">
        <h1 className="sidebar-title">Clinic Brain</h1>
        <p className="sidebar-subtitle">Painel profissional</p>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {availableSections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={section.key === activeSection ? 'nav-item nav-item-active' : 'nav-item'}
              onClick={() => setActiveSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="logout-button"
          onClick={() => {
            clearAccessToken()
            setToken(null)
          }}
        >
          Sair
        </button>
      </aside>

      <main className="content-area">
        <header className="content-header">
          <h2>{title}</h2>
        </header>

        {activeSection === 'dashboard' && <DashboardPage />}
        {activeSection === 'agenda' && <AgendaPage />}
        {activeSection === 'patients' && <PatientsPage />}
        {activeSection === 'reports' && <ReportsPage />}
        {activeSection === 'requests' && <PatientRequestsPage />}
        {activeSection === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
