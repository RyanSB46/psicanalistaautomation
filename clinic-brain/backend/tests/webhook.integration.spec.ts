import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../src/interfaces/http/app'
import { prisma } from '../src/infra/database/prisma/client'

vi.mock('../src/application/services/evolution/send-evolution-message.service', () => {
  return {
    sendEvolutionMessage: vi.fn(async () => ({ ok: true })),
  }
})

describe('Webhook integration', () => {
  let professionalId = ''

  beforeAll(async () => {
    const professional = await prisma.professional.findFirst({
      where: {
        email: 'ana.silva@clinicbrain.local',
      },
      select: {
        id: true,
      },
    })

    if (!professional) {
      throw new Error('Profissional seed não encontrado para teste de webhook')
    }

    professionalId = professional.id
  })

  afterAll(async () => {
    await prisma.interaction.deleteMany({
      where: {
        externalMessageId: {
          startsWith: 'webhook-integration-',
        },
      },
    })
  })

  it('deve processar webhook de texto e persistir interação do paciente', async () => {
    const messageId = `webhook-integration-${Date.now().toString()}`

    const response = await request(app)
      .post('/webhook')
      .set('x-webhook-api-key', process.env.WEBHOOK_API_KEY as string)
      .send({
        event: 'messages.upsert',
        instance: 'automation',
        data: {
          key: {
            id: messageId,
            remoteJid: '5527996087528@s.whatsapp.net',
            fromMe: false,
          },
          message: {
            conversation: 'Teste integração webhook',
          },
          messageType: 'conversation',
        },
      })

    expect(response.status).toBe(200)

    const interaction = await prisma.interaction.findFirst({
      where: {
        professionalId,
        externalMessageId: messageId,
      },
      select: {
        id: true,
        messageType: true,
      },
    })

    expect(interaction?.id).toBeTruthy()
    expect(interaction?.messageType).toBe('PACIENTE')
  })
})
