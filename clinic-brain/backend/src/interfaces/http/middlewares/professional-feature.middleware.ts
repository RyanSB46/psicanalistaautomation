import { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../infra/database/prisma/client'
import {
  DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
  PROFESSIONAL_FEATURE_FLAGS_SELECT,
  ProfessionalFeatureKey,
} from '../features/professional-features'

const FEATURE_LABELS: Record<ProfessionalFeatureKey, string> = {
  dashboardEnabled: 'Dashboard',
  agendaEnabled: 'Agenda',
  manualActionEnabled: 'Ações manuais na agenda',
  patientsEnabled: 'Pacientes',
  reportsEnabled: 'Relatórios',
  requestsEnabled: 'Solicitações',
  settingsEnabled: 'Configurações',
  patientPortalEnabled: 'Portal do paciente',
  webhookEnabled: 'Webhook',
}

export function requireProfessionalFeature(featureKey: ProfessionalFeatureKey) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const professionalId = request.professionalId

      if (!professionalId) {
        return response.status(401).json({ message: 'Usuário não autenticado' })
      }

      const settings = await prisma.settings.findUnique({
        where: {
          professionalId,
        },
        select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
      })

      const isEnabled = settings?.[featureKey] ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS[featureKey]

      if (!isEnabled) {
        return response.status(403).json({
          message: `A funcionalidade "${FEATURE_LABELS[featureKey]}" está desativada para este profissional.`,
        })
      }

      return next()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
        return next()
      }

      return next(error)
    }
  }
}
