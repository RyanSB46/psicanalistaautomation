import request from 'supertest'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { app } from '../src/interfaces/http/app'
import { prisma } from '../src/infra/database/prisma/client'
import { sendEvolutionMessage } from '../src/application/services/evolution/send-evolution-message.service'

vi.mock('../src/application/services/evolution/send-evolution-message.service', () => {
  return {
    sendEvolutionMessage: vi.fn(async () => ({ ok: true })),
  }
})

describe('Manual appointment actions integration', () => {
  const professionalIdsToCleanup: string[] = []
  const sendEvolutionMessageMock = vi.mocked(sendEvolutionMessage)

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

  it('deve marcar consulta manual para horário disponível em dia útil', async () => {
    sendEvolutionMessageMock.mockClear()

    const unique = Date.now().toString()
    const registerResponse = await request(app).post('/api/auth/register').send({
      name: 'Profissional Integração Agenda Manual',
      email: `agenda.manual.${unique}@clinicbrain.local`,
      password: 'Senha@123456',
      phoneNumber: '5527994445555',
    })

    expect(registerResponse.status).toBe(201)

    const token = registerResponse.body.accessToken as string
    const professionalId = registerResponse.body.professional.id as string
    professionalIdsToCleanup.push(professionalId)

    const bookingResponse = await request(app)
      .post('/api/appointments/manual-action')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'BOOK',
        patient: {
          name: 'Paciente Agenda Manual',
          phoneNumber: '27999998888',
        },
        startsAt: '2026-02-19T12:00:00-03:00',
        endsAt: '2026-02-19T12:50:00-03:00',
        notes: 'Agendamento manual via painel',
        message: 'Mensagem para paciente no WhatsApp',
      })

    expect(bookingResponse.status).toBe(201)
    expect(bookingResponse.body.action).toBe('BOOK')
    expect(bookingResponse.body.appointmentId).toBeTypeOf('string')
    expect(bookingResponse.body.status).toBe('AGENDADO')
    expect(sendEvolutionMessageMock).toHaveBeenCalled()

    const call = sendEvolutionMessageMock.mock.calls[0]?.[0]
    expect(call?.text).toContain('Mensagem da profissional: Mensagem para paciente no WhatsApp')
    expect(call?.text).not.toContain('Agendamento manual via painel')
  })

  it('deve incluir observações na mensagem ao remarcar manualmente', async () => {
    sendEvolutionMessageMock.mockClear()

    const unique = `${Date.now().toString()}-reschedule`
    const registerResponse = await request(app).post('/api/auth/register').send({
      name: 'Profissional Integração Remarcação Manual',
      email: `agenda.manual.reschedule.${unique}@clinicbrain.local`,
      password: 'Senha@123456',
      phoneNumber: '5527994446666',
    })

    expect(registerResponse.status).toBe(201)

    const token = registerResponse.body.accessToken as string
    const professionalId = registerResponse.body.professional.id as string
    professionalIdsToCleanup.push(professionalId)

    const bookingResponse = await request(app)
      .post('/api/appointments/manual-action')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'BOOK',
        patient: {
          name: 'Paciente Agenda Manual Remarcação',
          phoneNumber: '27999997777',
        },
        startsAt: '2026-02-19T13:00:00-03:00',
        endsAt: '2026-02-19T13:50:00-03:00',
      })

    expect(bookingResponse.status).toBe(201)

    const rescheduleResponse = await request(app)
      .post('/api/appointments/manual-action')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'RESCHEDULE',
        appointmentId: bookingResponse.body.appointmentId,
        patient: {
          name: 'Paciente Agenda Manual Remarcação',
          phoneNumber: '27999997777',
        },
        startsAt: '2026-02-19T14:00:00-03:00',
        endsAt: '2026-02-19T14:50:00-03:00',
        notes: 'Observação de remarcação manual',
        message: 'Nova mensagem para paciente na remarcação',
      })

    expect(rescheduleResponse.status).toBe(200)
    expect(rescheduleResponse.body.action).toBe('RESCHEDULE')
    expect(sendEvolutionMessageMock).toHaveBeenCalled()

    const lastCall = sendEvolutionMessageMock.mock.calls[sendEvolutionMessageMock.mock.calls.length - 1]?.[0]
    expect(lastCall?.text).toContain('Mensagem da profissional: Nova mensagem para paciente na remarcação')
    expect(lastCall?.text).not.toContain('Observação de remarcação manual')
  })
})
