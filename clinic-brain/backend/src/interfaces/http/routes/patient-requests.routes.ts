import { InteractionType } from '@prisma/client'
import { Router } from 'express'
import { AppError } from '../../../application/errors/app-error'
import { sendEvolutionMessage } from '../../../application/services/evolution/send-evolution-message.service'
import { createAppointment } from '../../../application/use-cases/appointments/create-appointment.use-case'
import { rescheduleAppointment } from '../../../application/use-cases/appointments/reschedule-appointment.use-case'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import { reviewPatientRequestSchema } from '../schemas/patient-request.schema'

type PatientRequestPayload = {
  type: 'BOOK_REQUEST' | 'RESCHEDULE_REQUEST'
  status: 'PENDING_PROFESSIONAL_APPROVAL' | 'APPROVED' | 'REJECTED'
  source: 'PATIENT_PORTAL'
  startsAt?: string
  endsAt?: string
  appointmentId?: string
  currentStartsAt?: string
  currentEndsAt?: string
  requestedStartsAt?: string
  requestedEndsAt?: string
  reviewedAt?: string
  reviewReason?: string
}

function parsePayload(messageText: string): PatientRequestPayload | null {
  try {
    const parsed = JSON.parse(messageText) as Partial<PatientRequestPayload>

    if (
      (parsed.type === 'BOOK_REQUEST' || parsed.type === 'RESCHEDULE_REQUEST') &&
      parsed.status &&
      parsed.source === 'PATIENT_PORTAL'
    ) {
      return parsed as PatientRequestPayload
    }

    return null
  } catch {
    return null
  }
}

function buildPatientReviewMessage(input: {
  action: 'APPROVE' | 'REJECT'
  requestType: 'BOOK_REQUEST' | 'RESCHEDULE_REQUEST'
  reason?: string
}): string {
  const requestLabel = input.requestType === 'BOOK_REQUEST' ? 'agendamento' : 'remarcação'
  const statusLabel = input.action === 'APPROVE' ? 'aprovada' : 'rejeitada'
  const reason = input.reason?.trim()
  const reasonText = reason ? `\nMotivo: ${reason}` : ''

  return `Sua solicitação de ${requestLabel} foi ${statusLabel} pela profissional.${reasonText}`
}

export const patientRequestsRoutes = Router()

patientRequestsRoutes.use(
  '/patient-requests',
  authMiddleware,
  tenantScopeMiddleware,
  requireProfessionalFeature('requestsEnabled'),
)

patientRequestsRoutes.get('/patient-requests/pending', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string

    const interactions = await prisma.interaction.findMany({
      where: {
        professionalId,
        messageType: InteractionType.PACIENTE,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 300,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    })

    const requests = interactions
      .map((interaction) => {
        const payload = parsePayload(interaction.messageText)

        if (!payload || payload.status !== 'PENDING_PROFESSIONAL_APPROVAL') {
          return null
        }

        return {
          id: interaction.id,
          createdAt: interaction.createdAt,
          patient: interaction.patient,
          payload,
        }
      })
      .filter(Boolean)

    return response.status(200).json(requests)
  } catch (error) {
    return next(error)
  }
})

patientRequestsRoutes.post(
  '/patient-requests/:id/review',
  validateBody(reviewPatientRequestSchema),
  async (request, response, next) => {
    try {
      const professionalId = request.professionalId as string
      const requestId = String(request.params.id)
      const { action, reason } = request.body as { action: 'APPROVE' | 'REJECT'; reason?: string }

      const interaction = await prisma.interaction.findFirst({
        where: {
          id: requestId,
          professionalId,
          messageType: InteractionType.PACIENTE,
        },
        select: {
          id: true,
          patientId: true,
          messageText: true,
          patient: {
            select: {
              phoneNumber: true,
            },
          },
        },
      })

      if (!interaction) {
        throw new AppError('Solicitação não encontrada', 404)
      }

      const payload = parsePayload(interaction.messageText)

      if (!payload || payload.status !== 'PENDING_PROFESSIONAL_APPROVAL') {
        throw new AppError('Solicitação já processada ou inválida', 400)
      }

      if (!interaction.patientId) {
        throw new AppError('Solicitação sem paciente vinculado', 400)
      }

      if (action === 'APPROVE') {
        if (payload.type === 'BOOK_REQUEST') {
          if (!payload.startsAt || !payload.endsAt) {
            throw new AppError('Dados da solicitação de agendamento inválidos', 400)
          }

          await createAppointment({
            professionalId,
            patientId: interaction.patientId,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            notes: 'Solicitação aprovada no portal do paciente',
          })
        } else {
          if (!payload.appointmentId || !payload.requestedStartsAt || !payload.requestedEndsAt) {
            throw new AppError('Dados da solicitação de remarcação inválidos', 400)
          }

          await rescheduleAppointment({
            professionalId,
            appointmentId: payload.appointmentId,
            startsAt: payload.requestedStartsAt,
            endsAt: payload.requestedEndsAt,
          })
        }
      }

      const reviewedPayload: PatientRequestPayload = {
        ...payload,
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date().toISOString(),
        reviewReason: reason?.trim() || undefined,
      }

      const notificationText = buildPatientReviewMessage({
        action,
        requestType: payload.type,
        reason,
      })

      await prisma.$transaction([
        prisma.interaction.update({
          where: { id: interaction.id },
          data: {
            messageText: JSON.stringify(reviewedPayload),
          },
        }),
        prisma.interaction.create({
          data: {
            professionalId,
            patientId: interaction.patientId,
            messageType: InteractionType.BOT,
            messageText: notificationText,
          },
        }),
      ])

      let deliveryWarning: string | undefined

      try {
        await sendEvolutionMessage({
          phoneNumber: interaction.patient?.phoneNumber ?? '',
          text: notificationText,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarning =
          'Solicitação processada, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
      }

      return response.status(200).json({
        requestId,
        status: reviewedPayload.status,
        deliveryWarning,
      })
    } catch (error) {
      return next(error)
    }
  },
)
