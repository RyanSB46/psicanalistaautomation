import { env } from '../../config/env'

type SendTextMessageInput = {
  phoneNumber: string
  text: string
  instanceName?: string
  apiKey?: string
}

type SendMessageResponse = {
  ok: boolean
  status: number
  body: unknown
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export class EvolutionApiClient {
  async sendTextMessage(input: SendTextMessageInput): Promise<SendMessageResponse> {
    const instanceName = input.instanceName ?? env.EVOLUTION_INSTANCE
    const apiKey = input.apiKey ?? env.EVOLUTION_API_KEY
    const endpoint = `${env.EVOLUTION_URL}/message/sendText/${instanceName}`

    for (let attempt = 1; attempt <= env.EVOLUTION_RETRY_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), env.EVOLUTION_TIMEOUT_MS)

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: input.phoneNumber,
            text: input.text,
          }),
          signal: controller.signal,
        })

        const body = await response.json().catch(() => null)

        if (response.ok) {
          return {
            ok: true,
            status: response.status,
            body,
          }
        }

        if (attempt === env.EVOLUTION_RETRY_ATTEMPTS) {
          return {
            ok: false,
            status: response.status,
            body,
          }
        }
      } catch {
        if (attempt === env.EVOLUTION_RETRY_ATTEMPTS) {
          return {
            ok: false,
            status: 0,
            body: { message: 'Falha ao enviar mensagem para Evolution API' },
          }
        }
      } finally {
        clearTimeout(timeout)
      }

      await wait(300 * attempt)
    }

    return {
      ok: false,
      status: 0,
      body: { message: 'Falha inesperada no cliente Evolution API' },
    }
  }
}
