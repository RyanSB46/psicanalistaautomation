import { clearAccessToken, getAccessToken } from '../../shared/auth/token-storage'

export type AuthLoginResult = {
  accessToken: string
  professional: {
    id: string
    name: string
    email: string
  }
}

export type AdminLoginResult = {
  accessToken: string
  admin: {
    id: string
    name: string
    email: string
  }
}

export type DashboardOverview = {
  totalPatients: number
  activePatients: number
  monthAppointments: number
  upcomingAppointments: number
  canceledAppointments: number
}

export type AppointmentListItem = {
  id: string
  patientId: string
  startsAt: string
  endsAt: string
  status: 'AGENDADO' | 'CONFIRMADO' | 'CANCELADO' | 'FALTOU' | 'REMARCADO'
  notes?: string | null
  createdAt: string
  updatedAt: string
  rescheduledFromId?: string | null
  rescheduledFrom?: {
    id: string
    startsAt: string
    endsAt: string
    createdAt: string
  } | null
  rescheduledTo: Array<{
    id: string
    startsAt: string
    endsAt: string
    createdAt: string
  }>
  patient: {
    id: string
    name: string
    phoneNumber: string
  }
}

export type PatientListItem = {
  id: string
  name: string
  phoneNumber: string
  email?: string | null
  status: 'ATIVO' | 'INATIVO'
  createdAt: string
}

export type SettingsMessages = {
  welcomeMessage: string
  confirmationMessage: string
  cancellationPolicy: string
  reminderD1Enabled: boolean
  reminder2hEnabled: boolean
}

export type ProfessionalFeatureFlags = {
  dashboardEnabled: boolean
  agendaEnabled: boolean
  manualActionEnabled: boolean
  patientsEnabled: boolean
  reportsEnabled: boolean
  requestsEnabled: boolean
  settingsEnabled: boolean
  patientPortalEnabled: boolean
  webhookEnabled: boolean
}

export const DEFAULT_PROFESSIONAL_FEATURE_FLAGS: ProfessionalFeatureFlags = {
  dashboardEnabled: true,
  agendaEnabled: true,
  manualActionEnabled: true,
  patientsEnabled: true,
  reportsEnabled: true,
  requestsEnabled: true,
  settingsEnabled: true,
  patientPortalEnabled: true,
  webhookEnabled: true,
}

export type MonthlyReport = {
  period: {
    from: string
    to: string
  }
  totalConsultations: number
  confirmed: number
  canceled: number
  missed: number
  attendanceRate: number
  estimatedRevenueCents: number
  activePatients: number
  inactivePatients: number
  summaryByStatus: {
    AGENDADO: number
    CONFIRMADO: number
    CANCELADO: number
    FALTOU: number
    REMARCADO: number
  }
  detailedAppointments: Array<{
    id: string
    startsAt: string
    endsAt: string
    status: 'AGENDADO' | 'CONFIRMADO' | 'CANCELADO' | 'FALTOU' | 'REMARCADO'
    notes?: string | null
    patient: {
      id: string
      name: string
      phoneNumber: string
    }
  }>
}

export type PendingPatientRequest = {
  id: string
  createdAt: string
  patient: {
    id: string
    name: string
    phoneNumber: string
  } | null
  payload: {
    type: 'BOOK_REQUEST' | 'RESCHEDULE_REQUEST'
    status: 'PENDING_PROFESSIONAL_APPROVAL'
    startsAt?: string
    endsAt?: string
    appointmentId?: string
    currentStartsAt?: string
    currentEndsAt?: string
    requestedStartsAt?: string
    requestedEndsAt?: string
  }
}

export type PatientPortalAuthResult = {
  accessToken: string
  patient: {
    id: string
    name: string
    phoneNumber: string
  }
  professional: {
    id: string
    name: string
    slug: string
  }
}

export type PatientPortalAvailability = {
  month: number
  year: number
  slotDurationMinutes: number
  slotIntervalMinutes: number
  slots: Array<{
    startsAt: string
    endsAt: string
  }>
  slotsByDay: Record<
    string,
    Array<{
      startsAt: string
      endsAt: string
    }>
  >
  availableDays: string[]
}

export type PatientPortalAppointment = {
  id: string
  startsAt: string
  endsAt: string
  status: 'AGENDADO' | 'CONFIRMADO' | 'CANCELADO' | 'FALTOU' | 'REMARCADO'
}

export type ManualAppointmentActionInput = {
  action: 'BOOK' | 'RESCHEDULE' | 'CANCEL'
  appointmentId?: string
  patient: {
    name: string
    phoneNumber: string
    email?: string
  }
  startsAt?: string
  endsAt?: string
  reason?: string
  notes?: string
  message?: string
}

export type ManualAppointmentActionResult = {
  action: 'BOOK' | 'RESCHEDULE' | 'CANCEL'
  message: string
  deliveryWarning?: string
  appointmentId?: string
  oldAppointmentId?: string
  newAppointmentId?: string
  status?: 'AGENDADO' | 'CONFIRMADO' | 'CANCELADO' | 'FALTOU' | 'REMARCADO'
}

function resolveApiBaseUrl(): string {
  const explicitApiUrl = import.meta.env.VITE_API_URL

  if (explicitApiUrl && explicitApiUrl.trim().length > 0) {
    return explicitApiUrl
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
    return `${protocol}://${window.location.hostname}:3000/api`
  }

  return 'http://localhost:3000/api'
}

const apiBaseUrl = resolveApiBaseUrl()

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type AvailabilityBlockItem = {
  id: string
  startsAt: string
  endsAt: string
  reason?: string | null
  createdAt: string
}

export type CreateAvailabilityBlocksInput = {
  fromDate: string
  toDate: string
  startTime: string
  endTime: string
  weekdays?: number[]
  reason?: string
}

async function apiRequest<TResponse>(
  path: string,
  method: RequestMethod,
  body?: Record<string, unknown>,
  requiresAuth = true,
): Promise<TResponse> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (requiresAuth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401) {
    clearAccessToken()
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(data?.message ?? 'Falha ao processar requisição')
    }

    const text = (await response.text().catch(() => '')).trim()
    throw new Error(text || 'Falha ao processar requisição')
  }

  return response.json() as Promise<TResponse>
}

export function login(email: string, password: string) {
  return apiRequest<AuthLoginResult>('/auth/login', 'POST', { email, password }, false)
}

export function loginAdmin(email: string, password: string) {
  return apiRequest<AdminLoginResult>('/auth/admin/login', 'POST', { email, password }, false)
}

export function fetchDashboardOverview() {
  return apiRequest<DashboardOverview>('/dashboard/overview', 'GET')
}

export function fetchAppointments() {
  return apiRequest<AppointmentListItem[]>('/appointments', 'GET')
}

export function fetchAvailabilityBlocks(from?: string, to?: string) {
  const params = new URLSearchParams()
  if (from) {
    params.set('from', from)
  }
  if (to) {
    params.set('to', to)
  }

  const query = params.toString()
  return apiRequest<AvailabilityBlockItem[]>(`/appointments/availability-blocks${query ? `?${query}` : ''}`, 'GET')
}

export function createAvailabilityBlocks(input: CreateAvailabilityBlocksInput) {
  return apiRequest<{ message: string; blocks: AvailabilityBlockItem[] }>('/appointments/availability-blocks', 'POST', input)
}

export function deleteAvailabilityBlock(blockId: string) {
  return apiRequest<{ message: string }>(`/appointments/availability-blocks/${blockId}`, 'DELETE')
}

export function executeManualAppointmentAction(input: ManualAppointmentActionInput) {
  return apiRequest<ManualAppointmentActionResult>('/appointments/manual-action', 'POST', input)
}

export function fetchPatients() {
  return apiRequest<PatientListItem[]>('/patients', 'GET')
}

export function createPatient(input: { name: string; phoneNumber: string; email?: string }) {
  return apiRequest<PatientListItem>('/patients', 'POST', input)
}

export function fetchSettingsMessages() {
  return apiRequest<SettingsMessages>('/settings/messages', 'GET')
}

export function fetchSettingsFeatures() {
  return apiRequest<ProfessionalFeatureFlags>('/settings/features', 'GET')
}

export function updateSettingsMessages(input: {
  welcomeMessage: string
  confirmationMessage: string
  cancellationPolicy: string
}) {
  return apiRequest<SettingsMessages>('/settings/messages', 'PUT', input)
}

export function updateSettingsFeatures(input: Partial<ProfessionalFeatureFlags>) {
  return apiRequest<ProfessionalFeatureFlags>('/settings/features', 'PUT', input)
}

export function fetchMonthlyReport(from: string, to: string) {
  const query = new URLSearchParams({ from, to })
  return apiRequest<MonthlyReport>(`/reports/monthly?${query.toString()}`, 'GET')
}

export function fetchPendingPatientRequests() {
  return apiRequest<PendingPatientRequest[]>('/patient-requests/pending', 'GET')
}

export function reviewPatientRequest(input: { id: string; action: 'APPROVE' | 'REJECT'; reason?: string }) {
  return apiRequest<{ requestId: string; status: 'APPROVED' | 'REJECTED'; deliveryWarning?: string }>(
    `/patient-requests/${input.id}/review`,
    'POST',
    {
      action: input.action,
      reason: input.reason,
    },
  )
}

async function patientPortalRequest<TResponse>(
  path: string,
  method: RequestMethod,
  body?: Record<string, unknown>,
  accessToken?: string,
): Promise<TResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401) {
    throw new Error('Sessão expirada no portal. Solicite um novo código de acesso.')
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(data?.message ?? 'Falha ao processar requisição')
    }

    const text = (await response.text().catch(() => '')).trim()
    throw new Error(text || 'Falha ao processar requisição')
  }

  return response.json() as Promise<TResponse>
}

export function requestPatientOtpCode(input: {
  professionalSlug: string
  fullName: string
  phoneNumber: string
}) {
  return patientPortalRequest<{ message: string; expiresInSeconds: number; devCode?: string; deliveryWarning?: string }>(
    '/public/patients/auth/request-code',
    'POST',
    input,
  )
}

export function verifyPatientOtpCode(input: {
  professionalSlug: string
  phoneNumber: string
  code: string
}) {
  return patientPortalRequest<PatientPortalAuthResult>('/public/patients/auth/verify-code', 'POST', input)
}

export function fetchPatientPortalAvailability(accessToken: string, month: number, year: number) {
  return patientPortalRequest<PatientPortalAvailability>(
    `/public/patients/availability?month=${month}&year=${year}`,
    'GET',
    undefined,
    accessToken,
  )
}

export function fetchPatientPortalAppointments(accessToken: string) {
  return patientPortalRequest<PatientPortalAppointment[]>('/public/patients/appointments', 'GET', undefined, accessToken)
}

export function createPatientBooking(
  accessToken: string,
  input: {
    startsAt: string
    endsAt: string
  },
) {
  return patientPortalRequest<{ message: string; appointmentId: string }>('/public/patients/bookings', 'POST', input, accessToken)
}

export function reschedulePatientActiveAppointment(
  accessToken: string,
  input: {
    startsAt: string
    endsAt: string
  },
) {
  return patientPortalRequest<{ message: string; requestId: string; deliveryWarning?: string }>(
    '/public/patients/reschedule-active',
    'POST',
    input,
    accessToken,
  )
}

export function cancelPatientAppointment(
  accessToken: string,
  input: {
    appointmentId: string
    reason?: string
  },
) {
  return patientPortalRequest<{
    appointmentId: string
    status: 'CANCELADO'
    message: string
    deliveryWarning?: string
  }>('/public/patients/cancel-appointment', 'POST', input, accessToken)
}
