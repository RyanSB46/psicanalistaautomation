export type ProfessionalFeatureKey =
  | 'dashboardEnabled'
  | 'agendaEnabled'
  | 'manualActionEnabled'
  | 'patientsEnabled'
  | 'reportsEnabled'
  | 'requestsEnabled'
  | 'settingsEnabled'
  | 'patientPortalEnabled'
  | 'webhookEnabled'

export type ProfessionalFeatureFlags = Record<ProfessionalFeatureKey, boolean>

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

export const PROFESSIONAL_FEATURE_FLAGS_SELECT = {
  dashboardEnabled: true,
  agendaEnabled: true,
  manualActionEnabled: true,
  patientsEnabled: true,
  reportsEnabled: true,
  requestsEnabled: true,
  settingsEnabled: true,
  patientPortalEnabled: true,
  webhookEnabled: true,
} as const

export function normalizeProfessionalFeatureFlags(
  input?: Partial<ProfessionalFeatureFlags> | null,
): ProfessionalFeatureFlags {
  return {
    dashboardEnabled: input?.dashboardEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.dashboardEnabled,
    agendaEnabled: input?.agendaEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.agendaEnabled,
    manualActionEnabled: input?.manualActionEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.manualActionEnabled,
    patientsEnabled: input?.patientsEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.patientsEnabled,
    reportsEnabled: input?.reportsEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.reportsEnabled,
    requestsEnabled: input?.requestsEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.requestsEnabled,
    settingsEnabled: input?.settingsEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.settingsEnabled,
    patientPortalEnabled: input?.patientPortalEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.patientPortalEnabled,
    webhookEnabled: input?.webhookEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.webhookEnabled,
  }
}
