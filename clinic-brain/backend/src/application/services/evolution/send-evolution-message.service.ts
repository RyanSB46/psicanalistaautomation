import { AppError } from '../../errors/app-error'
import { EvolutionApiClient } from '../../../infra/integrations/evolution/evolution-api.client'

type SendEvolutionMessageInput = {
  phoneNumber: string
  text: string
  instanceName?: string
  apiKey?: string
}

const client = new EvolutionApiClient()

function normalizeWhatsappPhone(value: string): string {
  const digits = value.replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}

export async function sendEvolutionMessage(input: SendEvolutionMessageInput) {
  const phoneNumber = normalizeWhatsappPhone(input.phoneNumber)

  if (!phoneNumber || phoneNumber.length < 12) {
    throw new AppError('Número de telefone inválido para envio', 400)
  }

  if (!input.text || input.text.trim().length === 0) {
    throw new AppError('Texto da mensagem é obrigatório', 400)
  }

  const result = await client.sendTextMessage({
    phoneNumber,
    text: input.text.trim(),
    instanceName: input.instanceName,
    apiKey: input.apiKey,
  })

  if (!result.ok) {
    throw new AppError('Falha ao enviar mensagem via Evolution API', 502)
  }

  return result
}
