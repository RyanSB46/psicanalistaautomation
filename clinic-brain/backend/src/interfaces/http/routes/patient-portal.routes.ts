import { AppointmentStatus, InteractionType } from '@prisma/client'
import { Router } from 'express'
import { AppError } from '../../../application/errors/app-error'
import { createAppointment } from '../../../application/use-cases/appointments/create-appointment.use-case'
import { cancelAppointment } from '../../../application/use-cases/appointments/cancel-appointment.use-case'
import { sendEvolutionMessage } from '../../../application/services/evolution/send-evolution-message.service'
import { prisma } from '../../../infra/database/prisma/client'
import { signAccessToken } from '../../../infra/security/jwt'
import { authMiddleware } from '../middlewares/auth.middleware'
import { patientAuthMiddleware } from '../middlewares/patient-auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import {
  DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
  PROFESSIONAL_FEATURE_FLAGS_SELECT,
} from '../features/professional-features'
import {
  patientBookingRequestSchema,
  patientCancelRequestSchema,
  patientRescheduleRequestSchema,
  requestPatientOtpCodeSchema,
  verifyPatientOtpCodeSchema,
} from '../schemas/patient-portal.schema'

const OTP_TTL_MS = 10 * 60 * 1000
const SLOT_DURATION_MINUTES = 50
const SLOT_INTERVAL_MINUTES = 60
const SLOT_START_HOUR = 8
const SLOT_END_HOUR = 18

type OtpEntry = {
  code: string
  expiresAt: number
  patientId: string
  professionalId: string
  phoneNumber: string
}

const otpStore = new Map<string, OtpEntry>()

function buildOtpKey(professionalId: string, phoneNumber: string): string {
  return `${professionalId}:${phoneNumber}`
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${field} inválido`, 400)
  }

  return parsed
}

function formatDateTimeForMessage(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function isOverlapping(startsAt: Date, endsAt: Date, appointmentStartsAt: Date, appointmentEndsAt: Date): boolean {
  return startsAt < appointmentEndsAt && endsAt > appointmentStartsAt
}

async function findProfessionalBySlug(professionalSlug: string) {
  return prisma.professional.findFirst({
    where: {
      OR: [{ evolutionInstanceName: professionalSlug }, { id: professionalSlug }],
    },
    select: {
      id: true,
      name: true,
      evolutionInstanceName: true,
      evolutionApiKey: true,
      timezone: true,
    },
  })
}

async function isPatientPortalEnabled(professionalId: string): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: {
      professionalId,
    },
    select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
  })

  return settings?.patientPortalEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.patientPortalEnabled
}

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export const patientPortalRoutes = Router()

patientPortalRoutes.post(
  '/public/patients/auth/request-code',
  validateBody(requestPatientOtpCodeSchema),
  async (request, response, next) => {
    try {
      const { professionalSlug, fullName, phoneNumber } = request.body as {
        professionalSlug: string
        fullName: string
        phoneNumber: string
      }

      const professional = await findProfessionalBySlug(professionalSlug)

      if (!professional) {
        throw new AppError('Profissional não encontrado', 404)
      }

      const portalEnabled = await isPatientPortalEnabled(professional.id)

      if (!portalEnabled) {
        throw new AppError('Portal do paciente desativado para esta profissional', 403)
      }

      const patient = await prisma.patient.upsert({
        where: {
          professionalId_phoneNumber: {
            professionalId: professional.id,
            phoneNumber,
          },
        },
        update: {
          name: fullName,
          status: 'ATIVO',
        },
        create: {
          professionalId: professional.id,
          name: fullName,
          phoneNumber,
          status: 'ATIVO',
        },
      })

      const code = generateSixDigitCode()
      const key = buildOtpKey(professional.id, phoneNumber)

      otpStore.set(key, {
        code,
        expiresAt: Date.now() + OTP_TTL_MS,
        patientId: patient.id,
        professionalId: professional.id,
        phoneNumber,
      })

      const otpText = `Seu código de acesso ao portal da ${professional.name} é: ${code}. Ele expira em 10 minutos.`

      let deliveryWarning: string | undefined

      try {
        await sendEvolutionMessage({
          phoneNumber,
          text: otpText,
          instanceName: professional.evolutionInstanceName ?? undefined,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarning =
          'Não foi possível enviar OTP via Evolution API neste ambiente. Use o devCode para validação local.'
      }

      const shouldExposeDevCode = process.env.NODE_ENV !== 'production' && Boolean(deliveryWarning)

      return response.status(200).json({
        message: deliveryWarning ?? 'Código de acesso enviado para validação.',
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
        devCode: shouldExposeDevCode ? code : undefined,
        deliveryWarning,
      })
    } catch (error) {
      return next(error)
    }
  },
)

patientPortalRoutes.post(
  '/public/patients/auth/verify-code',
  validateBody(verifyPatientOtpCodeSchema),
  async (request, response, next) => {
    try {
      const { professionalSlug, phoneNumber, code } = request.body as {
        professionalSlug: string
        phoneNumber: string
        code: string
      }

      const professional = await findProfessionalBySlug(professionalSlug)

      if (!professional) {
        throw new AppError('Profissional não encontrado', 404)
      }

      const portalEnabled = await isPatientPortalEnabled(professional.id)

      if (!portalEnabled) {
        throw new AppError('Portal do paciente desativado para esta profissional', 403)
      }

      const key = buildOtpKey(professional.id, phoneNumber)
      const otp = otpStore.get(key)

      if (!otp || otp.expiresAt < Date.now() || otp.code !== code) {
        throw new AppError('Código inválido ou expirado', 401)
      }

      otpStore.delete(key)

      const accessToken = signAccessToken({
        sub: otp.patientId,
        role: 'PATIENT',
        professionalId: otp.professionalId,
        patientId: otp.patientId,
        phoneNumber: otp.phoneNumber,
      })

      const patient = await prisma.patient.findFirst({
        where: {
          id: otp.patientId,
          professionalId: otp.professionalId,
        },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
        },
      })

      if (!patient) {
        throw new AppError('Paciente não encontrado', 404)
      }

      return response.status(200).json({
        accessToken,
        patient,
        professional: {
          id: professional.id,
          name: professional.name,
          slug: professional.evolutionInstanceName ?? professional.id,
        },
      })
    } catch (error) {
      return next(error)
    }
  },
)

patientPortalRoutes.get(
  '/public/patients/appointments',
  authMiddleware,
  patientAuthMiddleware,
  requireProfessionalFeature('patientPortalEnabled'),
  async (request, response, next) => {
  try {
    const now = new Date()

    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId: request.professionalId as string,
        patientId: request.patientId as string,
        startsAt: {
          gte: now,
        },
        status: {
          in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
        },
      },
      orderBy: {
        startsAt: 'asc',
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    })

    return response.status(200).json(appointments)
  } catch (error) {
    return next(error)
  }
},
)

patientPortalRoutes.get(
  '/public/patients/availability',
  authMiddleware,
  patientAuthMiddleware,
  requireProfessionalFeature('patientPortalEnabled'),
  async (request, response, next) => {
  try {
    const now = new Date()
    const monthRaw = typeof request.query.month === 'string' ? Number(request.query.month) : now.getMonth() + 1
    const yearRaw = typeof request.query.year === 'string' ? Number(request.query.year) : now.getFullYear()

    const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1
    const year = Number.isFinite(yearRaw) && yearRaw >= 2020 && yearRaw <= 2100 ? yearRaw : now.getFullYear()

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999)

    const occupiedAppointments = await prisma.appointment.findMany({
      where: {
        professionalId: request.professionalId as string,
        startsAt: {
          gte: now,
          lte: periodEnd,
        },
        status: {
          in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
        },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    })

    const blockedPeriods = await prisma.professionalAvailabilityBlock.findMany({
      where: {
        professionalId: request.professionalId as string,
        startsAt: {
          lte: periodEnd,
        },
        endsAt: {
          gte: now,
        },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    })

    const slots: Array<{ startsAt: string; endsAt: string }> = []

    const totalDaysInMonth = new Date(year, month, 0).getDate()

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const reference = new Date(year, month - 1, day)

      const weekDay = reference.getDay()
      if (weekDay === 0 || weekDay === 6) {
        continue
      }

      for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
        const startsAt = new Date(reference)
        startsAt.setHours(hour, 0, 0, 0)

        const endsAt = new Date(startsAt)
        endsAt.setMinutes(endsAt.getMinutes() + SLOT_DURATION_MINUTES)

        if (startsAt <= now) {
          continue
        }

        const busy = occupiedAppointments.some((appointment) =>
          isOverlapping(startsAt, endsAt, appointment.startsAt, appointment.endsAt),
        )

        const blocked = blockedPeriods.some((period) => isOverlapping(startsAt, endsAt, period.startsAt, period.endsAt))

        if (!busy && !blocked) {
          slots.push({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          })
        }
      }
    }

    const slotsByDay = slots.reduce<Record<string, Array<{ startsAt: string; endsAt: string }>>>((acc, slot) => {
      const dayKey = slot.startsAt.slice(0, 10)
      if (!acc[dayKey]) {
        acc[dayKey] = []
      }
      acc[dayKey].push(slot)
      return acc
    }, {})

    const availableDays = Object.keys(slotsByDay)

    return response.status(200).json({
      month,
      year,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
      slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
      slots,
      slotsByDay,
      availableDays,
    })
  } catch (error) {
    return next(error)
  }
},
)

patientPortalRoutes.post(
  '/public/patients/bookings',
  authMiddleware,
  patientAuthMiddleware,
  requireProfessionalFeature('patientPortalEnabled'),
  validateBody(patientBookingRequestSchema),
  async (request, response, next) => {
    try {
      const startsAt = parseDate(request.body.startsAt, 'startsAt')
      const endsAt = parseDate(request.body.endsAt, 'endsAt')

      if (endsAt <= startsAt) {
        throw new AppError('endsAt deve ser maior que startsAt', 400)
      }

      const conflict = await prisma.appointment.findFirst({
        where: {
          professionalId: request.professionalId as string,
          status: {
            in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
          },
          startsAt: {
            lt: endsAt,
          },
          endsAt: {
            gt: startsAt,
          },
        },
        select: {
          id: true,
        },
      })

      if (conflict) {
        throw new AppError('Horário indisponível para este profissional', 409)
      }

      const patient = await prisma.patient.findFirst({
        where: {
          id: request.patientId as string,
          professionalId: request.professionalId as string,
        },
        select: {
          id: true,
          phoneNumber: true,
        },
      })

      if (!patient) {
        throw new AppError('Paciente não encontrado', 404)
      }

      const professional = await prisma.professional.findUnique({
        where: {
          id: request.professionalId as string,
        },
        select: {
          id: true,
          phoneNumber: true,
          evolutionInstanceName: true,
          evolutionApiKey: true,
          timezone: true,
        },
      })

      if (!professional) {
        throw new AppError('Profissional não encontrado', 404)
      }

      const created = await createAppointment({
        professionalId: request.professionalId as string,
        patientId: patient.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: 'Agendamento realizado no portal do cliente',
      })

      const startsAtDate = new Date(created.startsAt)
      const datetime = formatDateTimeForMessage(startsAtDate, professional.timezone)

      let deliveryWarning: string | undefined

      try {
        await sendEvolutionMessage({
          phoneNumber: patient.phoneNumber,
          text: `✅ Seu agendamento foi realizado com sucesso!\n📅 Data e horário: ${datetime}\nTe aguardo no dia marcado.`,
          instanceName: professional.evolutionInstanceName ?? undefined,
          apiKey: professional.evolutionApiKey ?? undefined,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarning =
          'Agendamento confirmado, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
      }

      await prisma.interaction.create({
        data: {
          professionalId: request.professionalId as string,
          patientId: request.patientId as string,
          appointmentId: created.id,
          messageText: `BOOK_CONFIRMED|${startsAt.toISOString()}|${endsAt.toISOString()}|PATIENT_PORTAL`,
          messageType: InteractionType.PACIENTE,
        },
      })

      return response.status(200).json({
        message: deliveryWarning ?? 'Agendamento confirmado com sucesso.',
        appointmentId: created.id,
        deliveryWarning,
      })
    } catch (error) {
      return next(error)
    }
  },
)

patientPortalRoutes.post(
  '/public/patients/cancel-appointment',
  authMiddleware,
  patientAuthMiddleware,
  requireProfessionalFeature('patientPortalEnabled'),
  validateBody(patientCancelRequestSchema),
  async (request, response, next) => {
    try {
      const appointmentId = String(request.body.appointmentId)
      const reason = typeof request.body.reason === 'string' ? request.body.reason : undefined

      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          professionalId: request.professionalId as string,
          patientId: request.patientId as string,
          startsAt: {
            gte: new Date(),
          },
          status: {
            in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
          },
        },
        select: {
          id: true,
          startsAt: true,
          patient: {
            select: {
              name: true,
            },
          },
        },
      })

      if (!appointment) {
        throw new AppError('Consulta não encontrada para cancelamento', 404)
      }

      const professional = await prisma.professional.findUnique({
        where: {
          id: request.professionalId as string,
        },
        select: {
          id: true,
          phoneNumber: true,
          evolutionInstanceName: true,
          evolutionApiKey: true,
          timezone: true,
        },
      })

      if (!professional) {
        throw new AppError('Profissional não encontrado', 404)
      }

      const canceled = await cancelAppointment({
        professionalId: request.professionalId as string,
        appointmentId: appointment.id,
        reason,
      })

      const datetime = formatDateTimeForMessage(appointment.startsAt, professional.timezone)
      const normalizedReason = reason?.trim()
      const reasonText = normalizedReason ? `\nMotivo informado: ${normalizedReason}` : ''
      const notifyProfessionalText = `🚨 Cancelamento no portal do paciente\nPaciente: ${appointment.patient.name}\nConsulta: ${datetime}${reasonText}`

      let deliveryWarning: string | undefined

      if (professional.phoneNumber) {
        try {
          await sendEvolutionMessage({
            phoneNumber: professional.phoneNumber,
            text: notifyProfessionalText,
            instanceName: professional.evolutionInstanceName ?? undefined,
            apiKey: professional.evolutionApiKey ?? undefined,
          })
        } catch (error) {
          if (process.env.NODE_ENV === 'production') {
            throw error
          }

          deliveryWarning =
            'Cancelamento registrado, mas a notificação para a profissional não pôde ser enviada no ambiente local.'
        }
      } else {
        deliveryWarning =
          'Cancelamento registrado, mas a profissional não possui telefone cadastrado para notificação automática.'
      }

      await prisma.interaction.create({
        data: {
          professionalId: request.professionalId as string,
          patientId: request.patientId as string,
          appointmentId: appointment.id,
          messageType: InteractionType.PACIENTE,
          messageText: `CANCEL_REQUEST|${appointment.id}|${appointment.startsAt.toISOString()}|${normalizedReason ?? ''}|PATIENT_PORTAL`,
        },
      })

      return response.status(200).json({
        appointmentId: canceled.id,
        status: canceled.status,
        message: deliveryWarning ?? 'Consulta cancelada com sucesso e profissional notificada.',
        deliveryWarning,
      })
    } catch (error) {
      return next(error)
    }
  },
)

patientPortalRoutes.post(
  '/public/patients/reschedule-active',
  authMiddleware,
  patientAuthMiddleware,
  requireProfessionalFeature('patientPortalEnabled'),
  validateBody(patientBookingRequestSchema),
  async (request, response, next) => {
    try {
      const startsAt = parseDate(request.body.startsAt, 'startsAt')
      const endsAt = parseDate(request.body.endsAt, 'endsAt')

      if (endsAt <= startsAt) {
        throw new AppError('endsAt deve ser maior que startsAt', 400)
      }

      const currentAppointment = await prisma.appointment.findFirst({
        where: {
          professionalId: request.professionalId as string,
          patientId: request.patientId as string,
          startsAt: {
            gte: new Date(),
          },
          status: {
            in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
          },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
        },
        orderBy: {
          startsAt: 'asc',
        },
      })

      if (!currentAppointment) {
        throw new AppError('Consulta não encontrada para remarcação', 404)
      }

      const conflict = await prisma.appointment.findFirst({
        where: {
          id: {
            not: currentAppointment.id,
          },
          professionalId: request.professionalId as string,
          status: {
            in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
          },
          startsAt: {
            lt: endsAt,
          },
          endsAt: {
            gt: startsAt,
          },
        },
        select: {
          id: true,
        },
      })

      if (conflict) {
        throw new AppError('Novo horário indisponível para este profissional', 409)
      }

      const professional = await prisma.professional.findUnique({
        where: {
          id: request.professionalId as string,
        },
        select: {
          id: true,
          phoneNumber: true,
          evolutionInstanceName: true,
          evolutionApiKey: true,
          timezone: true,
        },
      })

      if (!professional) {
        throw new AppError('Profissional não encontrado', 404)
      }

      const patient = await prisma.patient.findFirst({
        where: {
          id: request.patientId as string,
          professionalId: request.professionalId as string,
        },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
        },
      })

      if (!patient) {
        throw new AppError('Paciente não encontrado', 404)
      }

      const pendingPayload = {
        type: 'RESCHEDULE_REQUEST',
        status: 'PENDING_PROFESSIONAL_APPROVAL',
        source: 'PATIENT_PORTAL',
        appointmentId: currentAppointment.id,
        currentStartsAt: currentAppointment.startsAt.toISOString(),
        currentEndsAt: currentAppointment.endsAt.toISOString(),
        requestedStartsAt: startsAt.toISOString(),
        requestedEndsAt: endsAt.toISOString(),
      }

      const pendingInteraction = await prisma.interaction.create({
        data: {
          professionalId: request.professionalId as string,
          patientId: request.patientId as string,
          appointmentId: currentAppointment.id,
          messageText: JSON.stringify(pendingPayload),
          messageType: InteractionType.PACIENTE,
        },
      })

      const currentDatetime = formatDateTimeForMessage(currentAppointment.startsAt, professional.timezone)
      const requestedDatetime = formatDateTimeForMessage(startsAt, professional.timezone)

      const deliveryWarnings: string[] = []

      try {
        await sendEvolutionMessage({
          phoneNumber: patient.phoneNumber,
          text: `📝 Recebi sua solicitação de remarcação.\n📅 Horário atual: ${currentDatetime}\n🕒 Novo horário solicitado: ${requestedDatetime}\nA profissional irá analisar e aprovar no painel.`,
          instanceName: professional.evolutionInstanceName ?? undefined,
          apiKey: professional.evolutionApiKey ?? undefined,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarnings.push(
          'Solicitação criada, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
        )
      }

      const notifyProfessionalText =
        `🔔 Nova solicitação de remarcação no portal.\n` +
        `Paciente: ${patient.name}\n` +
        `Horário atual: ${currentDatetime}\n` +
        `Novo horário solicitado: ${requestedDatetime}`

      if (professional.phoneNumber) {
        try {
          await sendEvolutionMessage({
            phoneNumber: professional.phoneNumber,
            text: notifyProfessionalText,
            instanceName: professional.evolutionInstanceName ?? undefined,
            apiKey: professional.evolutionApiKey ?? undefined,
          })
        } catch {
          deliveryWarnings.push(
            'A solicitação foi registrada, mas não foi possível notificar a profissional via WhatsApp.',
          )
        }
      } else {
        deliveryWarnings.push(
          'A solicitação foi registrada, mas a profissional não possui telefone cadastrado para notificação automática.',
        )
      }

      const deliveryWarning = deliveryWarnings.length > 0 ? deliveryWarnings.join(' ') : undefined

      return response.status(200).json({
        message: deliveryWarning ?? 'Solicitação de remarcação enviada para aprovação da profissional.',
        requestId: pendingInteraction.id,
        deliveryWarning,
      })
    } catch (error) {
      return next(error)
    }
  },
)
