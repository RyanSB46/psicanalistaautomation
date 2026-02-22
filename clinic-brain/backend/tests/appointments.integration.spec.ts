import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { app } from '../src/interfaces/http/app'
import { prisma } from '../src/infra/database/prisma/client'

describe('Appointments integration', () => {
  const professionalIdsToCleanup: string[] = []

  afterAll(async () => {
    if (professionalIdsToCleanup.length > 0) {
      await prisma.professional.deleteMany({
        where: {
          id: {
            in: professionalIdsToCleanup,
          },
        },
      })
    }
  })

  it('deve criar agendamento autenticado', async () => {
    const unique = Date.now().toString()
    const registerResponse = await request(app).post('/api/auth/register').send({
      name: 'Profissional Integração Agenda',
      email: `agenda.integration.${unique}@clinicbrain.local`,
      password: 'Senha@123456',
      phoneNumber: '5527993334444',
    })

    expect(registerResponse.status).toBe(201)

    const token = registerResponse.body.accessToken as string
    const professionalId = registerResponse.body.professional.id as string
    professionalIdsToCleanup.push(professionalId)

    const patient = await prisma.patient.create({
      data: {
        professionalId,
        name: 'Paciente Integração Agenda',
        phoneNumber: `55279977${unique.slice(-4)}`,
        status: 'ATIVO',
      },
      select: {
        id: true,
      },
    })

    const createResponse = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: patient.id,
        startsAt: '2026-03-10T15:00:00-03:00',
        endsAt: '2026-03-10T15:50:00-03:00',
        notes: 'Teste integração agendamento',
      })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.id).toBeTypeOf('string')
    expect(createResponse.body.status).toBe('AGENDADO')
  })
})
