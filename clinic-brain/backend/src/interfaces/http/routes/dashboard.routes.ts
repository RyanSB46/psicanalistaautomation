import { AppointmentStatus } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'

export const dashboardRoutes = Router()

dashboardRoutes.use('/dashboard', authMiddleware, tenantScopeMiddleware, requireProfessionalFeature('dashboardEnabled'))

dashboardRoutes.get('/dashboard/overview', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [totalPatients, activePatients, monthAppointments, upcomingAppointments, canceledAppointments] =
      await Promise.all([
        prisma.patient.count({
          where: {
            professionalId,
          },
        }),
        prisma.patient.count({
          where: {
            professionalId,
            status: 'ATIVO',
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            startsAt: {
              gte: monthStart,
              lt: monthEnd,
            },
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            status: {
              in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
            },
            startsAt: {
              gte: now,
            },
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            status: AppointmentStatus.CANCELADO,
            startsAt: {
              gte: monthStart,
              lt: monthEnd,
            },
          },
        }),
      ])

    return response.status(200).json({
      totalPatients,
      activePatients,
      monthAppointments,
      upcomingAppointments,
      canceledAppointments,
    })
  } catch (error) {
    return next(error)
  }
})
