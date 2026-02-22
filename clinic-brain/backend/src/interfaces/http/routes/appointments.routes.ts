import { Router } from 'express'
import { AppointmentStatus } from '@prisma/client'
import { createAppointment } from '../../../application/use-cases/appointments/create-appointment.use-case'
import { rescheduleAppointment } from '../../../application/use-cases/appointments/reschedule-appointment.use-case'
import { cancelAppointment } from '../../../application/use-cases/appointments/cancel-appointment.use-case'
import { confirmAppointmentPresence } from '../../../application/use-cases/appointments/confirm-appointment-presence.use-case'
import { sendEvolutionMessage } from '../../../application/services/evolution/send-evolution-message.service'
import { AppError } from '../../../application/errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requireProfessionalFeature } from '../middlewares/professional-feature.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import {
  cancelAppointmentSchema,
  createAvailabilityBlockSchema,
  createAppointmentSchema,
  manualAppointmentActionSchema,
  rescheduleAppointmentSchema,
} from '../schemas/appointment.schema'

const SLOT_DURATION_MINUTES = 50
const SLOT_START_HOUR = 8
const SLOT_END_HOUR = 18

function normalizePhone(value: string): string {
  return String(value).replace(/\D/g, '')
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

function getDatePartsInTimezone(date: Date, timezone: string): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const hourRaw = Number(parts.find((part) => part.type === 'hour')?.value ?? Number.NaN)
  const minuteRaw = Number(parts.find((part) => part.type === 'minute')?.value ?? Number.NaN)

  if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) {
    throw new AppError('Não foi possível validar o horário informado', 400)
  }

  return {
    weekday,
    hour: hourRaw,
    minute: minuteRaw,
  }
}

function validateManualScheduleWindow(startsAt: Date, endsAt: Date, timezone: string) {
  if (endsAt <= startsAt) {
    throw new AppError('endsAt deve ser maior que startsAt', 400)
  }

  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)

  if (durationMinutes !== SLOT_DURATION_MINUTES) {
    throw new AppError(`A duração da consulta manual deve ser de ${SLOT_DURATION_MINUTES} minutos`, 400)
  }

  const startsAtParts = getDatePartsInTimezone(startsAt, timezone)
  const weekDay = startsAtParts.weekday.toLowerCase()

  if (weekDay === 'sat' || weekDay === 'sun') {
    throw new AppError('A profissional não atende aos finais de semana', 409)
  }

  if (startsAtParts.minute !== 0) {
    throw new AppError('A consulta manual deve iniciar em hora cheia (ex.: 09:00, 10:00)', 400)
  }

  if (startsAtParts.hour < SLOT_START_HOUR || startsAtParts.hour >= SLOT_END_HOUR) {
    throw new AppError('Horário fora da agenda da profissional (08:00 às 18:00)', 409)
  }
}

function parseDateOnly(value: string, field: string): Date {
  const parsed = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${field} inválido`, 400)
  }

  return parsed
}

function parseTimeToHoursAndMinutes(value: string, field: string): { hour: number; minute: number } {
  const [hoursRaw, minutesRaw] = String(value).split(':')
  const hour = Number(hoursRaw)
  const minute = Number(minutesRaw)

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new AppError(`${field} inválido`, 400)
  }

  return { hour, minute }
}

async function ensureProfessionalSlotAvailability(
  professionalId: string,
  startsAt: Date,
  endsAt: Date,
  errorMessage: string,
  excludeAppointmentId?: string,
) {
  const conflict = await prisma.appointment.findFirst({
    where: {
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
      professionalId,
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
    throw new AppError(errorMessage, 409)
  }
}

async function ensurePatientSlotAvailability(
  professionalId: string,
  patientId: string,
  startsAt: Date,
  endsAt: Date,
  errorMessage: string,
  excludeAppointmentId?: string,
) {
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
      professionalId,
      patientId,
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

  if (patientConflict) {
    throw new AppError(errorMessage, 409)
  }
}

export const appointmentsRoutes = Router()

appointmentsRoutes.use('/', authMiddleware, tenantScopeMiddleware, requireProfessionalFeature('agendaEnabled'))

appointmentsRoutes.get('/', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const startsAtFrom =
      typeof request.query.startsAtFrom === 'string' ? new Date(request.query.startsAtFrom) : null
    const startsAtTo =
      typeof request.query.startsAtTo === 'string' ? new Date(request.query.startsAtTo) : null

    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId,
        startsAt:
          startsAtFrom || startsAtTo
            ? {
                gte: startsAtFrom ?? undefined,
                lte: startsAtTo ?? undefined,
              }
            : undefined,
      },
      orderBy: {
        startsAt: 'asc',
      },
      select: {
        id: true,
        patientId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        rescheduledFromId: true,
        rescheduledFrom: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
          },
        },
        rescheduledTo: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        patient: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    })

    return response.status(200).json(appointments)
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.get('/availability-blocks', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const fromRaw = typeof request.query.from === 'string' ? request.query.from : null
    const toRaw = typeof request.query.to === 'string' ? request.query.to : null

    const from = fromRaw ? parseDate(fromRaw, 'from') : null
    const to = toRaw ? parseDate(toRaw, 'to') : null

    const blocks = await prisma.professionalAvailabilityBlock.findMany({
      where: {
        professionalId,
        startsAt: from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined,
      },
      orderBy: {
        startsAt: 'asc',
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        createdAt: true,
      },
    })

    return response.status(200).json(blocks)
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.post('/availability-blocks', validateBody(createAvailabilityBlockSchema), async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const fromDate = parseDateOnly(String(request.body.fromDate), 'fromDate')
    const toDate = parseDateOnly(String(request.body.toDate), 'toDate')
    const { hour: startHour, minute: startMinute } = parseTimeToHoursAndMinutes(
      String(request.body.startTime),
      'startTime',
    )
    const { hour: endHour, minute: endMinute } = parseTimeToHoursAndMinutes(String(request.body.endTime), 'endTime')
    const weekdays = Array.isArray(request.body.weekdays) ? (request.body.weekdays as number[]) : []
    const weekdaysSet = new Set(weekdays)
    const reason = typeof request.body.reason === 'string' && request.body.reason.trim().length > 0
      ? request.body.reason.trim()
      : null

    const createdBlocks: Array<{ startsAt: Date; endsAt: Date; reason: string | null }> = []
    const cursor = new Date(fromDate)

    while (cursor <= toDate) {
      const weekDay = cursor.getDay()
      if (weekdaysSet.size === 0 || weekdaysSet.has(weekDay)) {
        const startsAt = new Date(cursor)
        startsAt.setHours(startHour, startMinute, 0, 0)
        const endsAt = new Date(cursor)
        endsAt.setHours(endHour, endMinute, 0, 0)

        if (endsAt <= startsAt) {
          throw new AppError('endTime deve ser maior que startTime', 400)
        }

        createdBlocks.push({ startsAt, endsAt, reason })
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    if (createdBlocks.length === 0) {
      throw new AppError('Nenhum dia selecionado para bloqueio no período informado', 400)
    }

    const created = await prisma.$transaction(async (tx) => {
      const inserted: Array<{ id: string; startsAt: Date; endsAt: Date; reason: string | null; createdAt: Date }> = []

      for (const block of createdBlocks) {
        const item = await tx.professionalAvailabilityBlock.create({
          data: {
            professionalId,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            reason: block.reason,
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            reason: true,
            createdAt: true,
          },
        })

        inserted.push(item)
      }

      return inserted
    })

    return response.status(201).json({
      message: `${created.length} bloqueio(s) de agenda criado(s) com sucesso.`,
      blocks: created,
    })
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.delete('/availability-blocks/:id', async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const blockId = String(request.params.id)

    const block = await prisma.professionalAvailabilityBlock.findFirst({
      where: {
        id: blockId,
        professionalId,
      },
      select: {
        id: true,
      },
    })

    if (!block) {
      throw new AppError('Bloqueio de agenda não encontrado', 404)
    }

    await prisma.professionalAvailabilityBlock.delete({
      where: {
        id: block.id,
      },
    })

    return response.status(200).json({
      message: 'Bloqueio de agenda removido com sucesso.',
    })
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.post('/', validateBody(createAppointmentSchema), async (request, response, next) => {
  try {
    const result = await createAppointment({
      professionalId: request.professionalId as string,
      patientId: request.body.patientId,
      startsAt: request.body.startsAt,
      endsAt: request.body.endsAt,
      notes: request.body.notes,
    })

    return response.status(201).json(result)
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.post(
  '/manual-action',
  requireProfessionalFeature('manualActionEnabled'),
  validateBody(manualAppointmentActionSchema),
  async (request, response, next) => {
  try {
    const professionalId = request.professionalId as string
    const action = String(request.body.action) as 'BOOK' | 'RESCHEDULE' | 'CANCEL'
    const patientName = String(request.body.patient.name).trim()
    const patientPhone = normalizePhone(String(request.body.patient.phoneNumber))
    const patientEmail =
      typeof request.body.patient.email === 'string' && request.body.patient.email.trim().length > 0
        ? request.body.patient.email.trim()
        : null

    if (patientPhone.length < 10) {
      throw new AppError('Telefone do paciente inválido', 400)
    }

    const professional = await prisma.professional.findUnique({
      where: {
        id: professionalId,
      },
      select: {
        id: true,
        timezone: true,
        evolutionInstanceName: true,
        evolutionApiKey: true,
      },
    })

    if (!professional) {
      throw new AppError('Profissional não encontrada', 404)
    }

    const patient =
      action === 'BOOK'
        ? await prisma.patient.upsert({
            where: {
              professionalId_phoneNumber: {
                professionalId,
                phoneNumber: patientPhone,
              },
            },
            update: {
              name: patientName,
              email: patientEmail,
              status: 'ATIVO',
            },
            create: {
              professionalId,
              name: patientName,
              phoneNumber: patientPhone,
              email: patientEmail,
              status: 'ATIVO',
            },
            select: {
              id: true,
              name: true,
              phoneNumber: true,
            },
          })
        : await prisma.patient.findFirst({
            where: {
              professionalId,
              phoneNumber: patientPhone,
            },
            select: {
              id: true,
              name: true,
              phoneNumber: true,
            },
          })

    if (!patient) {
      throw new AppError('Paciente não encontrado com os dados informados', 404)
    }

    if (action === 'BOOK') {
      const startsAt = parseDate(String(request.body.startsAt), 'startsAt')
      const endsAt = parseDate(String(request.body.endsAt), 'endsAt')
      const normalizedNotes =
        typeof request.body.notes === 'string' && request.body.notes.trim().length > 0
          ? request.body.notes.trim()
          : ''
      const normalizedMessage =
        typeof request.body.message === 'string' && request.body.message.trim().length > 0
          ? request.body.message.trim()
          : ''

      validateManualScheduleWindow(startsAt, endsAt, professional.timezone)

      await ensureProfessionalSlotAvailability(
        professionalId,
        startsAt,
        endsAt,
        'Horário indisponível para este profissional',
      )

      await ensurePatientSlotAvailability(
        professionalId,
        patient.id,
        startsAt,
        endsAt,
        'Paciente já possui consulta nesse horário',
      )

      const created = await createAppointment({
        professionalId,
        patientId: patient.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: normalizedNotes || undefined,
      })

      const datetime = formatDateTimeForMessage(new Date(created.startsAt), professional.timezone)
      let deliveryWarning: string | undefined

      try {
        await sendEvolutionMessage({
          phoneNumber: patient.phoneNumber,
          text:
            `✅ Sua consulta foi marcada pela profissional.\n📅 Data e horário: ${datetime}` +
            (normalizedMessage ? `\nMensagem da profissional: ${normalizedMessage}` : ''),
          instanceName: professional.evolutionInstanceName ?? undefined,
          apiKey: professional.evolutionApiKey ?? undefined,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarning =
          'Consulta marcada, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
      }

      return response.status(201).json({
        action,
        appointmentId: created.id,
        status: created.status,
        message: deliveryWarning ?? 'Consulta marcada com sucesso.',
        deliveryWarning,
      })
    }

    const appointmentId = String(request.body.appointmentId)

    const currentAppointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        professionalId,
      },
      select: {
        id: true,
        patientId: true,
        startsAt: true,
        status: true,
      },
    })

    if (!currentAppointment) {
      throw new AppError('Consulta não encontrada', 404)
    }

    if (currentAppointment.patientId !== patient.id) {
      throw new AppError('A consulta informada não pertence ao paciente selecionado', 409)
    }

    if (action === 'RESCHEDULE') {
      if (
        currentAppointment.status !== AppointmentStatus.AGENDADO &&
        currentAppointment.status !== AppointmentStatus.CONFIRMADO
      ) {
        throw new AppError('Somente consultas agendadas ou confirmadas podem ser remarcadas', 400)
      }

      const startsAt = parseDate(String(request.body.startsAt), 'startsAt')
      const endsAt = parseDate(String(request.body.endsAt), 'endsAt')

      validateManualScheduleWindow(startsAt, endsAt, professional.timezone)

      await ensureProfessionalSlotAvailability(
        professionalId,
        startsAt,
        endsAt,
        'Novo horário indisponível para este profissional',
        currentAppointment.id,
      )

      await ensurePatientSlotAvailability(
        professionalId,
        patient.id,
        startsAt,
        endsAt,
        'Paciente já possui consulta nesse novo horário',
        currentAppointment.id,
      )

      const rescheduled = await rescheduleAppointment({
        professionalId,
        appointmentId: currentAppointment.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })

      const previousDatetime = formatDateTimeForMessage(currentAppointment.startsAt, professional.timezone)
      const newDatetime = formatDateTimeForMessage(startsAt, professional.timezone)
      const normalizedNotes =
        typeof request.body.notes === 'string' && request.body.notes.trim().length > 0
          ? request.body.notes.trim()
          : ''
      const normalizedMessage =
        typeof request.body.message === 'string' && request.body.message.trim().length > 0
          ? request.body.message.trim()
          : ''
      let deliveryWarning: string | undefined

      try {
        await sendEvolutionMessage({
          phoneNumber: patient.phoneNumber,
          text:
            `🔄 Sua consulta foi remarcada pela profissional.\n` +
            `📅 Horário anterior: ${previousDatetime}\n` +
            `🕒 Novo horário: ${newDatetime}` +
            (normalizedMessage ? `\nMensagem da profissional: ${normalizedMessage}` : ''),
          instanceName: professional.evolutionInstanceName ?? undefined,
          apiKey: professional.evolutionApiKey ?? undefined,
        })
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error
        }

        deliveryWarning =
          'Consulta remarcada, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
      }

      return response.status(200).json({
        action,
        oldAppointmentId: rescheduled.oldAppointmentId,
        newAppointmentId: rescheduled.newAppointmentId,
        message: deliveryWarning ?? 'Consulta remarcada com sucesso.',
        deliveryWarning,
      })
    }

    const canceled = await cancelAppointment({
      professionalId,
      appointmentId: currentAppointment.id,
      reason: typeof request.body.reason === 'string' ? request.body.reason : undefined,
    })

    const datetime = formatDateTimeForMessage(currentAppointment.startsAt, professional.timezone)
    const normalizedReason = typeof request.body.reason === 'string' ? request.body.reason.trim() : ''
    const reasonText = normalizedReason ? `\nMotivo: ${normalizedReason}` : ''
    const normalizedMessage =
      typeof request.body.message === 'string' && request.body.message.trim().length > 0
        ? request.body.message.trim()
        : ''
    const messageText = normalizedMessage ? `\nMensagem da profissional: ${normalizedMessage}` : ''

    let deliveryWarning: string | undefined

    try {
      await sendEvolutionMessage({
        phoneNumber: patient.phoneNumber,
        text: `❌ Sua consulta foi cancelada pela profissional.\n📅 Horário: ${datetime}${reasonText}${messageText}`,
        instanceName: professional.evolutionInstanceName ?? undefined,
        apiKey: professional.evolutionApiKey ?? undefined,
      })
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error
      }

      deliveryWarning =
        'Consulta cancelada, mas a mensagem de WhatsApp não pôde ser enviada no ambiente local.'
    }

    return response.status(200).json({
      action,
      appointmentId: canceled.id,
      status: canceled.status,
      message: deliveryWarning ?? 'Consulta cancelada com sucesso.',
      deliveryWarning,
    })
  } catch (error) {
    return next(error)
  }
},
)

appointmentsRoutes.patch(
  '/:id/reschedule',
  validateBody(rescheduleAppointmentSchema),
  async (request, response, next) => {
    try {
      const result = await rescheduleAppointment({
        professionalId: request.professionalId as string,
        appointmentId: String(request.params.id),
        startsAt: request.body.startsAt,
        endsAt: request.body.endsAt,
      })

      return response.status(200).json(result)
    } catch (error) {
      return next(error)
    }
  },
)

appointmentsRoutes.patch('/:id/cancel', validateBody(cancelAppointmentSchema), async (request, response, next) => {
  try {
    const result = await cancelAppointment({
      professionalId: request.professionalId as string,
      appointmentId: String(request.params.id),
      reason: typeof request.body.reason === 'string' ? request.body.reason : undefined,
    })

    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})

appointmentsRoutes.patch('/:id/confirm-presence', async (request, response, next) => {
  try {
    const result = await confirmAppointmentPresence({
      professionalId: request.professionalId as string,
      appointmentId: String(request.params.id),
    })

    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})
