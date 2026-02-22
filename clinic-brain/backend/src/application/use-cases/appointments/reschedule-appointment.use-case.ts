import { Prisma } from '@prisma/client'
import { AppError } from '../../errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'
import { ensureProfessionalAvailability } from '../../services/availability/professional-availability.service'

type RescheduleAppointmentInput = {
  professionalId: string
  appointmentId: string
  startsAt: string
  endsAt: string
}

type RescheduleAppointmentOutput = {
  oldAppointmentId: string
  newAppointmentId: string
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${field} inválido`, 400)
  }

  return parsed
}

function mapConcurrencyError(error: unknown): never {
  if (error instanceof Error) {
    const text = error.message

    if (
      text.includes('agendamentos_sem_conflito_horario_excl') ||
      text.includes('23P01') ||
      text.includes('restrição de exclusão')
    ) {
      throw new AppError('Novo horário já ocupado para este profissional', 409)
    }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = JSON.stringify(error.meta)

    if (message.includes('agendamentos_sem_conflito_horario_excl')) {
      throw new AppError('Novo horário já ocupado para este profissional', 409)
    }
  }

  throw error
}

export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<RescheduleAppointmentOutput> {
  const startsAt = parseDate(input.startsAt, 'startsAt')
  const endsAt = parseDate(input.endsAt, 'endsAt')

  if (endsAt <= startsAt) {
    throw new AppError('endsAt deve ser maior que startsAt', 400)
  }

  try {
    await ensureProfessionalAvailability({
      professionalId: input.professionalId,
      startsAt,
      endsAt,
    })

    return await prisma.$transaction(async (tx) => {
      const currentAppointment = await tx.appointment.findFirst({
        where: {
          id: input.appointmentId,
          professionalId: input.professionalId,
        },
      })

      if (!currentAppointment) {
        throw new AppError('Agendamento não encontrado', 404)
      }

      if (currentAppointment.status === 'CANCELADO') {
        throw new AppError('Não é possível remarcar um agendamento cancelado', 400)
      }

      const newAppointment = await tx.appointment.create({
        data: {
          professionalId: input.professionalId,
          patientId: currentAppointment.patientId,
          startsAt,
          endsAt,
          status: 'AGENDADO',
          rescheduledFromId: currentAppointment.id,
        },
      })

      await tx.appointment.update({
        where: { id: currentAppointment.id },
        data: {
          status: 'REMARCADO',
        },
      })

      return {
        oldAppointmentId: currentAppointment.id,
        newAppointmentId: newAppointment.id,
      }
    })
  } catch (error) {
    mapConcurrencyError(error)
  }
}
