import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/infra/database/prisma/client'
import { createAppointment } from '../src/application/use-cases/appointments/create-appointment.use-case'
import { hashPassword } from '../src/infra/security/password'

describe('Appointment service concurrency', () => {
  const professionalsToCleanup: string[] = []

  afterAll(async () => {
    if (professionalsToCleanup.length > 0) {
      await prisma.professional.deleteMany({
        where: {
          id: {
            in: professionalsToCleanup,
          },
        },
      })
    }

    await prisma.$disconnect()
  })

  it('deve permitir apenas um agendamento quando duas requisições competem pelo mesmo horário', async () => {
    const unique = Date.now().toString()

    const professional = await prisma.professional.create({
      data: {
        name: `Profissional Corrida ${unique}`,
        email: `corrida.${unique}@clinicbrain.local`,
        passwordHash: await hashPassword('Senha@12345'),
      },
    })

    professionalsToCleanup.push(professional.id)

    const patient = await prisma.patient.create({
      data: {
        professionalId: professional.id,
        name: `Paciente Corrida ${unique}`,
        phoneNumber: `55279999${unique.slice(-4)}`,
        status: 'ATIVO',
      },
    })

    const startsAt = new Date('2026-02-25T15:00:00-03:00').toISOString()
    const endsAt = new Date('2026-02-25T15:50:00-03:00').toISOString()

    const [attemptA, attemptB] = await Promise.allSettled([
      createAppointment({
        professionalId: professional.id,
        patientId: patient.id,
        startsAt,
        endsAt,
      }),
      createAppointment({
        professionalId: professional.id,
        patientId: patient.id,
        startsAt,
        endsAt,
      }),
    ])

    const fulfilled = [attemptA, attemptB].filter((result) => result.status === 'fulfilled')
    const rejected = [attemptA, attemptB].filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    if (rejected[0]?.status === 'rejected') {
      const reason = rejected[0].reason as Error
      expect(reason.message).toContain('Horário já ocupado')
    }

    const sameSlotCount = await prisma.appointment.count({
      where: {
        professionalId: professional.id,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
      },
    })

    expect(sameSlotCount).toBe(1)
  })
})
