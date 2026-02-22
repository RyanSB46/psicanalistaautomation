import { Prisma } from '@prisma/client'
import { AppError } from '../../errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'
import { ensureProfessionalAvailability } from '../../services/availability/professional-availability.service'

type CreateAppointmentInput = {
  professionalId: string
  patientId: string
  startsAt: string
  endsAt: string
  notes?: string
}

type AppointmentOutput = {
  id: string
  professionalId: string
  patientId: string
  startsAt: Date
  endsAt: Date
  status: string
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
      throw new AppError('Horário já ocupado para este profissional', 409)
    }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = JSON.stringify(error.meta)

    if (message.includes('agendamentos_sem_conflito_horario_excl')) {
      throw new AppError('Horário já ocupado para este profissional', 409)
    }
  }

  throw error
}

export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentOutput> {
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
      const patient = await tx.patient.findFirst({
        where: {
          id: input.patientId,
          professionalId: input.professionalId,
        },
      })

      if (!patient) {
        throw new AppError('Paciente não encontrado para este profissional', 404)
      }

      const appointment = await tx.appointment.create({
        data: {
          professionalId: input.professionalId,
          patientId: input.patientId,
          startsAt,
          endsAt,
          notes: input.notes,
          status: 'AGENDADO',
        },
      })

      return {
        id: appointment.id,
        professionalId: appointment.professionalId,
        patientId: appointment.patientId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
      }
    })
  } catch (error) {
    mapConcurrencyError(error)
  }
}
