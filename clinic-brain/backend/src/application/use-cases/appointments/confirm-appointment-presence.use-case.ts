import { AppError } from '../../errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'

type ConfirmAppointmentPresenceInput = {
  professionalId: string
  appointmentId: string
}

export async function confirmAppointmentPresence(input: ConfirmAppointmentPresenceInput) {
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
      throw new AppError('Não é possível confirmar presença em agendamento cancelado', 400)
    }

    const updated = await tx.appointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        status: 'CONFIRMADO',
      },
    })

    return {
      id: updated.id,
      status: updated.status,
    }
  })
}
