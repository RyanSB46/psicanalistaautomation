import { Router } from 'express'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import { createPatientSchema } from '../schemas/patient.schema'

export const patientsRoutes = Router()

patientsRoutes.use('/patients', authMiddleware, tenantScopeMiddleware, requireProfessionalFeature('patientsEnabled'))

patientsRoutes.get('/patients', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const patients = await prisma.patient.findMany({
      where: {
        professionalId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        status: true,
        createdAt: true,
      },
    })

    return response.status(200).json(patients)
  } catch (error) {
    return next(error)
  }
})

patientsRoutes.post('/patients', validateBody(createPatientSchema), async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const patient = await prisma.patient.create({
      data: {
        professionalId,
        name: request.body.name,
        phoneNumber: String(request.body.phoneNumber).replace(/\D/g, ''),
        email: request.body.email,
        status: 'ATIVO',
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        status: true,
        createdAt: true,
      },
    })

    return response.status(201).json(patient)
  } catch (error) {
    return next(error)
  }
})
