import { AppointmentStatus } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'

function startOfCurrentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function startOfNextMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

function parseDateParam(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  const value = new Date(raw)
  if (Number.isNaN(value.getTime())) {
    return null
  }

  return value
}

export const reportsRoutes = Router()

reportsRoutes.use('/reports', authMiddleware, tenantScopeMiddleware, requireProfessionalFeature('reportsEnabled'))

reportsRoutes.get('/reports/monthly', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const from = parseDateParam(request.query.from) ?? startOfCurrentMonth()
    const to = parseDateParam(request.query.to) ?? startOfNextMonth()

    if (to <= from) {
      return response.status(400).json({
        message: 'O período informado é inválido. O campo "Até" deve ser maior que o campo "De".',
      })
    }

    const [professional, totalConsultations, confirmed, canceled, missed, activePatients, inactivePatients, appointments] =
      await Promise.all([
        prisma.professional.findUnique({
          where: {
            id: professionalId,
          },
          select: {
            consultationFeeCents: true,
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            startsAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            status: AppointmentStatus.CONFIRMADO,
            startsAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            status: AppointmentStatus.CANCELADO,
            startsAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.appointment.count({
          where: {
            professionalId,
            status: AppointmentStatus.FALTOU,
            startsAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.patient.count({
          where: {
            professionalId,
            status: 'ATIVO',
          },
        }),
        prisma.patient.count({
          where: {
            professionalId,
            status: 'INATIVO',
          },
        }),
        prisma.appointment.findMany({
          where: {
            professionalId,
            startsAt: {
              gte: from,
              lt: to,
            },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            notes: true,
            patient: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
              },
            },
          },
          orderBy: {
            startsAt: 'asc',
          },
        }),
      ])

    const attendanceRate = totalConsultations > 0 ? Number(((confirmed / totalConsultations) * 100).toFixed(2)) : 0

    const consultationFeeCents = professional?.consultationFeeCents ?? 0
    const estimatedRevenueCents = confirmed * consultationFeeCents

    const summaryByStatus = {
      AGENDADO: 0,
      CONFIRMADO: 0,
      CANCELADO: 0,
      FALTOU: 0,
      REMARCADO: 0,
    }

    for (const appointment of appointments) {
      summaryByStatus[appointment.status] += 1
    }

    const detailedAppointments = appointments.map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      notes: appointment.notes,
      patient: {
        id: appointment.patient.id,
        name: appointment.patient.name,
        phoneNumber: appointment.patient.phoneNumber,
      },
    }))

    return response.status(200).json({
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalConsultations,
      confirmed,
      canceled,
      missed,
      attendanceRate,
      estimatedRevenueCents,
      activePatients,
      inactivePatients,
      summaryByStatus,
      detailedAppointments,
    })
  } catch (error) {
    return next(error)
  }
})
