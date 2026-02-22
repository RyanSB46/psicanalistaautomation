import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import {
  DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
  normalizeProfessionalFeatureFlags,
  PROFESSIONAL_FEATURE_FLAGS_SELECT,
} from '../features/professional-features'
import { updateSettingsFeaturesSchema, updateSettingsSchema } from '../schemas/settings.schema'

export const settingsRoutes = Router()

settingsRoutes.use('/settings', authMiddleware, tenantScopeMiddleware)

settingsRoutes.get('/settings/messages', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const settings = await prisma.settings.findUnique({
      where: {
        professionalId,
      },
      select: {
        welcomeMessage: true,
        confirmationMessage: true,
        cancellationPolicy: true,
        reminderD1Enabled: true,
        reminder2hEnabled: true,
      },
    })

    if (!settings) {
      return response.status(200).json({
        welcomeMessage: '',
        confirmationMessage: '',
        cancellationPolicy: '',
        reminderD1Enabled: true,
        reminder2hEnabled: true,
        ...DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
      })
    }

    return response.status(200).json(settings)
  } catch (error) {
    return next(error)
  }
})

settingsRoutes.put('/settings/messages', validateBody(updateSettingsSchema), async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const settings = await prisma.settings.upsert({
      where: {
        professionalId,
      },
      update: {
        welcomeMessage: request.body.welcomeMessage ?? null,
        confirmationMessage: request.body.confirmationMessage ?? null,
        cancellationPolicy: request.body.cancellationPolicy ?? null,
      },
      create: {
        professionalId,
        welcomeMessage: request.body.welcomeMessage ?? null,
        confirmationMessage: request.body.confirmationMessage ?? null,
        cancellationPolicy: request.body.cancellationPolicy ?? null,
      },
      select: {
        welcomeMessage: true,
        confirmationMessage: true,
        cancellationPolicy: true,
        reminderD1Enabled: true,
        reminder2hEnabled: true,
      },
    })

    return response.status(200).json(settings)
  } catch (error) {
    return next(error)
  }
})

settingsRoutes.get('/settings/features', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const settings = await prisma.settings.findUnique({
      where: {
        professionalId,
      },
      select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
    })

    return response.status(200).json(normalizeProfessionalFeatureFlags(settings))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      return response.status(200).json(DEFAULT_PROFESSIONAL_FEATURE_FLAGS)
    }

    return next(error)
  }
})

settingsRoutes.put('/settings/features', validateBody(updateSettingsFeaturesSchema), async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const currentSettings = await prisma.settings.findUnique({
      where: {
        professionalId,
      },
      select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
    })

    const nextFeatures = normalizeProfessionalFeatureFlags({
      ...currentSettings,
      ...request.body,
    })

    const updated = await prisma.settings.upsert({
      where: {
        professionalId,
      },
      update: {
        ...nextFeatures,
      },
      create: {
        professionalId,
        ...nextFeatures,
      },
      select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
    })

    return response.status(200).json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      return response.status(503).json({
        message: 'Feature flags indisponíveis até aplicar as migrações mais recentes do banco.',
      })
    }

    return next(error)
  }
})
