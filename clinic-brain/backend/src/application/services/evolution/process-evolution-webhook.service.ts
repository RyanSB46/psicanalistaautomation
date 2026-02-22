import { InteractionType } from '@prisma/client'
import { prisma } from '../../../infra/database/prisma/client'
import { env } from '../../../infra/config/env'
import {
  ConversationState,
  runConversationStateMachine,
} from '../../../domain/services/conversation-state-machine'
import { sendEvolutionMessage } from './send-evolution-message.service'
import {
  DEFAULT_PROFESSIONAL_FEATURE_FLAGS,
  PROFESSIONAL_FEATURE_FLAGS_SELECT,
} from '../../../interfaces/http/features/professional-features'

type ParsedTextEvent = {
  phoneNumber: string
  text: string
  messageId: string
}

type ProcessEvolutionWebhookResult = {
  ignored: boolean
  reason?: string
  payload?: ParsedTextEvent
  duplicate?: boolean
  conversation?: {
    previousState: ConversationState
    nextState: ConversationState
    shouldEnd: boolean
  }
}

type ResolvedProfessionalContext = {
  id: string
  name: string
  evolutionInstanceName: string | null
  evolutionApiKey: string | null
}

type JsonObject = Record<string, unknown>

function getNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source

  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    current = (current as JsonObject)[key]
  }

  return current
}

function getFirstString(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getNestedValue(source, path)

    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function extractPhoneNumber(payload: unknown): string | null {
  const candidate = getFirstString(payload, [
    ['data', 'key', 'remoteJid'],
    ['data', 'key', 'participant'],
    ['data', 'sender'],
    ['sender'],
    ['data', 'from'],
    ['from'],
    ['phone'],
    ['data', 'phone'],
    ['data', 'number'],
    ['number'],
  ])

  if (candidate) {
    const cleaned = onlyDigits(candidate)

    if (cleaned.length >= 10) {
      return cleaned
    }
  }

  return null
}

function extractTextMessage(payload: unknown): string | null {
  const candidate = getFirstString(payload, [
    ['data', 'message', 'conversation'],
    ['data', 'message', 'extendedTextMessage', 'text'],
    ['data', 'message', 'imageMessage', 'caption'],
    ['message', 'conversation'],
    ['message', 'extendedTextMessage', 'text'],
    ['data', 'text'],
    ['text'],
  ])

  if (candidate && candidate.trim().length > 0) {
    return candidate.trim()
  }

  return null
}

function extractMessageId(payload: unknown): string {
  const value =
    getNestedValue(payload, ['data', 'key', 'id']) ??
    getNestedValue(payload, ['data', 'id']) ??
    getNestedValue(payload, ['id']) ??
    `msg_${Date.now().toString()}`

  return String(value)
}

function extractInstanceName(payload: unknown): string | null {
  const candidate = getFirstString(payload, [
    ['instance'],
    ['instanceName'],
    ['data', 'instance'],
    ['data', 'instanceName'],
    ['sender', 'instance'],
    ['data', 'sender', 'instance'],
  ])

  if (!candidate) {
    return null
  }

  return candidate.trim()
}

function isSupportedTextEvent(payload: unknown): boolean {
  const event = String(getNestedValue(payload, ['event']) ?? '').toLowerCase()
  const messageType = String(
    getNestedValue(payload, ['data', 'messageType']) ?? getNestedValue(payload, ['type']) ?? '',
  ).toLowerCase()

  if (event.includes('message') || event.includes('messages')) {
    return true
  }

  if (
    messageType.includes('conversation') ||
    messageType.includes('text') ||
    messageType.includes('extendedtextmessage')
  ) {
    return true
  }

  return false
}

function isOutgoingMessage(payload: unknown): boolean {
  const fromMe = getNestedValue(payload, ['data', 'key', 'fromMe']) ?? getNestedValue(payload, ['fromMe'])

  return fromMe === true
}

function asConversationState(value: string | null | undefined): ConversationState {
  if (
    value === 'INITIAL' ||
    value === 'MAIN_MENU' ||
    value === 'SERVICES_MENU' ||
    value === 'ATTENDANT' ||
    value === 'CLOSED'
  ) {
    return value
  }

  return 'INITIAL'
}

async function resolveProfessionalContext(
  payload: unknown,
  phoneNumber: string,
): Promise<ResolvedProfessionalContext | null> {
  const explicitProfessionalId =
    getNestedValue(payload, ['professionalId']) ?? getNestedValue(payload, ['data', 'professionalId'])

  if (typeof explicitProfessionalId === 'string' && explicitProfessionalId.length > 0) {
    const professional = await prisma.professional.findUnique({
      where: {
        id: explicitProfessionalId,
      },
      select: {
        id: true,
        name: true,
        evolutionInstanceName: true,
        evolutionApiKey: true,
      },
    })

    if (professional) {
      return professional
    }
  }

  const instanceNameFromPayload = extractInstanceName(payload)
  const instanceName = instanceNameFromPayload ?? env.EVOLUTION_INSTANCE

  if (instanceName) {
    const professionalByInstance = await prisma.professional.findFirst({
      where: {
        evolutionInstanceName: instanceName,
      },
      select: {
        id: true,
        name: true,
        evolutionInstanceName: true,
        evolutionApiKey: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (professionalByInstance) {
      return professionalByInstance
    }
  }

  const patient = await prisma.patient.findFirst({
    where: {
      phoneNumber,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      professionalId: true,
    },
  })

  if (patient) {
    const professional = await prisma.professional.findUnique({
      where: {
        id: patient.professionalId,
      },
      select: {
        id: true,
        name: true,
        evolutionInstanceName: true,
        evolutionApiKey: true,
      },
    })

    if (professional) {
      return professional
    }
  }

  const professionals = await prisma.professional.findMany({
    select: {
      id: true,
      name: true,
      evolutionInstanceName: true,
      evolutionApiKey: true,
    },
    take: 2,
  })

  if (professionals.length === 1) {
    return professionals[0]
  }

  return null
}

export async function processEvolutionWebhook(payload: unknown): Promise<ProcessEvolutionWebhookResult> {
  const body = payload

  if (isOutgoingMessage(body)) {
    return {
      ignored: true,
      reason: 'Mensagem de saída ignorada',
    }
  }

  if (!isSupportedTextEvent(body)) {
    return {
      ignored: true,
      reason: 'Evento não suportado',
    }
  }

  const phoneNumber = extractPhoneNumber(body)
  const text = extractTextMessage(body)

  if (!phoneNumber || !text) {
    return {
      ignored: true,
      reason: 'Evento sem conteúdo de texto',
    }
  }

  const messageId = extractMessageId(body)
  const professionalContext = await resolveProfessionalContext(body, phoneNumber)

  if (!professionalContext) {
    return {
      ignored: true,
      reason: 'Profissional não identificado para este evento',
      payload: {
        phoneNumber,
        text,
        messageId,
      },
    }
  }

  const professionalId = professionalContext.id

  if (!professionalId) {
    return {
      ignored: true,
      reason: 'Profissional não identificado para este evento',
      payload: {
        phoneNumber,
        text,
        messageId,
      },
    }
  }

  const settings = await prisma.settings.findUnique({
    where: {
      professionalId,
    },
    select: PROFESSIONAL_FEATURE_FLAGS_SELECT,
  })

  const webhookEnabled = settings?.webhookEnabled ?? DEFAULT_PROFESSIONAL_FEATURE_FLAGS.webhookEnabled

  if (!webhookEnabled) {
    return {
      ignored: true,
      reason: 'Webhook desativado para este profissional',
      payload: {
        phoneNumber,
        text,
        messageId,
      },
    }
  }

  const existingInteraction = await prisma.interaction.findFirst({
    where: {
      professionalId,
      externalMessageId: messageId,
    },
    select: {
      id: true,
    },
  })

  if (existingInteraction) {
    return {
      ignored: true,
      reason: 'Evento duplicado já processado',
      duplicate: true,
      payload: {
        phoneNumber,
        text,
        messageId,
      },
    }
  }

  const patient = await prisma.patient.findFirst({
    where: {
      professionalId,
      phoneNumber,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
    },
  })

  const existingSession = await prisma.whatsappSession.findUnique({
    where: {
      professionalId_phoneNumber: {
        professionalId,
        phoneNumber,
      },
    },
    select: {
      currentState: true,
    },
  })

  const previousState = asConversationState(existingSession?.currentState)
  const conversation = runConversationStateMachine({
    currentState: previousState,
    userInput: text,
    bookingUrl: env.BOOKING_SITE_URL,
    doctorName: professionalContext.name,
  })

  await prisma.$transaction(async (tx) => {
    await tx.interaction.create({
      data: {
        professionalId,
        patientId: patient?.id,
        messageText: text,
        messageType: InteractionType.PACIENTE,
        externalMessageId: messageId,
      },
    })

    await tx.whatsappSession.upsert({
      where: {
        professionalId_phoneNumber: {
          professionalId,
          phoneNumber,
        },
      },
      update: {
        currentState: conversation.nextState,
        isActive: !conversation.shouldEnd,
        lastMessageAt: new Date(),
      },
      create: {
        professionalId,
        phoneNumber,
        currentState: conversation.nextState,
        isActive: !conversation.shouldEnd,
        lastMessageAt: new Date(),
      },
    })

    await tx.interaction.create({
      data: {
        professionalId,
        patientId: patient?.id,
        messageText: conversation.responseMessage,
        messageType: InteractionType.BOT,
      },
    })
  })

  await sendEvolutionMessage({
    phoneNumber,
    text: conversation.responseMessage,
    instanceName: professionalContext.evolutionInstanceName ?? undefined,
    apiKey: professionalContext.evolutionApiKey ?? undefined,
  })

  return {
    ignored: false,
    payload: {
      phoneNumber,
      text,
      messageId,
    },
    conversation: {
      previousState,
      nextState: conversation.nextState,
      shouldEnd: conversation.shouldEnd,
    },
  }
}
