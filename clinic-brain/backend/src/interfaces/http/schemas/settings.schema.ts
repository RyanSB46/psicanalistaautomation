import { z } from 'zod'

export const updateSettingsSchema = z.object({
  welcomeMessage: z.string().max(500).optional().nullable(),
  confirmationMessage: z.string().max(500).optional().nullable(),
  cancellationPolicy: z.string().max(1000).optional().nullable(),
})

export const updateSettingsFeaturesSchema = z
  .object({
    dashboardEnabled: z.boolean().optional(),
    agendaEnabled: z.boolean().optional(),
    manualActionEnabled: z.boolean().optional(),
    patientsEnabled: z.boolean().optional(),
    reportsEnabled: z.boolean().optional(),
    requestsEnabled: z.boolean().optional(),
    settingsEnabled: z.boolean().optional(),
    patientPortalEnabled: z.boolean().optional(),
    webhookEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos uma feature para atualizar',
  })
