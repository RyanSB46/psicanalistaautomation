import { AppError } from '../../errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'

type CancelAppointmentInput = {
  professionalId: string
  appointmentId: string
  reason?: string
}

export async function cancelAppointment(input: CancelAppointmentInput) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: {
        id: input.appointmentId,
        professionalId: input.professionalId,
      },
    })

    if (!appointment) {
      throw new AppError('Agendamento não encontrado', 404)
    }

    if (appointment.status === 'CANCELADO') {
      return {
        id: appointment.id,
        status: appointment.status,
      }
    }

    const updated = await tx.appointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        status: 'CANCELADO',
        notes: JSON.stringify({
          ...(appointment.notes
            ? {
                previousNotes: appointment.notes,
              }
            : {}),
          cancellation: {
            canceledAt: new Date().toISOString(),
            reason: input.reason?.trim() || null,
          },
        }),
      },
    })

    return {
      id: updated.id,
      status: updated.status,
    }
  })
}
