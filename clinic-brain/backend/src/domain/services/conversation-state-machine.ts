export const conversationStates = ['INITIAL', 'MAIN_MENU', 'SERVICES_MENU', 'ATTENDANT', 'CLOSED'] as const

export type ConversationState = (typeof conversationStates)[number]

export type ConversationTransitionResult = {
  nextState: ConversationState
  responseMessage: string
  shouldEnd: boolean
}

type ConversationTransitionInput = {
  currentState: ConversationState
  userInput: string
  bookingUrl?: string
  doctorName?: string
}

function normalizeInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\w\s]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
}

function mainMenuMessage(doctorName: string): string {
  return [
    `Olá! 👋 Você está falando com a assistente da ${doctorName}.`,
    'Escolha uma opção:',
    '1 - Marcar consulta',
    '2 - Remarcar consulta',
    '3 - Cancelar consulta',
    '4 - Conversar com a doutora',
    '0 - Encerrar conversa',
  ].join('\n')
}

function servicesMenuMessage(bookingUrl: string): string {
  return [
    'Fluxo de agendamento:',
    `1 - Marcar consulta (${bookingUrl})`,
    `2 - Remarcar consulta (${bookingUrl})`,
    `3 - Cancelar consulta (${bookingUrl})`,
    '4 - Conversar com a doutora',
    '0 - Voltar ao menu principal',
  ].join('\n')
}

function bookingActionMessage(action: 'marcar' | 'remarcar' | 'cancelar', bookingUrl: string): string {
  return [
    `Perfeito. Para ${action} consulta, use este link: ${bookingUrl}`,
    'Se quiser conversar direto com a doutora, envie 4.',
    'Para voltar ao menu principal, envie "menu".',
  ].join('\n')
}

function resolveOption(input: string): string {
  if (input === '0' || input === '1' || input === '2' || input === '3' || input === '4') {
    return input
  }

  if (input.includes('remarcar')) {
    return '2'
  }

  if (input.includes('marcar') || input.includes('agendar')) {
    return '1'
  }

  if (input.includes('cancelar')) {
    return '3'
  }

  if (
    input.includes('doutora') ||
    input.includes('atendente') ||
    input.includes('humano') ||
    input.includes('pessoa')
  ) {
    return '4'
  }

  return input
}

function invalidOptionMessage(state: ConversationState, doctorName: string, bookingUrl: string): string {
  if (state === 'SERVICES_MENU') {
    return `Não entendi sua opção.\n${servicesMenuMessage(bookingUrl)}`
  }

  if (state === 'ATTENDANT') {
    return `Estou te encaminhando para ${doctorName}. Envie "menu" para voltar ao menu principal ou "encerrar" para finalizar.`
  }

  if (state === 'CLOSED') {
    return 'Conversa finalizada. Envie "menu" para iniciar novamente.'
  }

  return `Não entendi sua opção.\n${mainMenuMessage(doctorName)}`
}

export function runConversationStateMachine(
  input: ConversationTransitionInput,
): ConversationTransitionResult {
  const normalizedInput = normalizeInput(input.userInput)
  const option = resolveOption(normalizedInput)
  const bookingUrl = input.bookingUrl ?? 'http://localhost:5173'
  const doctorName = input.doctorName ?? 'Dra. Ana'

  if (input.currentState === 'INITIAL') {
    return {
      nextState: 'MAIN_MENU',
      responseMessage: mainMenuMessage(doctorName),
      shouldEnd: false,
    }
  }

  if (input.currentState === 'MAIN_MENU') {
    if (option === '1') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('marcar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '2') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('remarcar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '3') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('cancelar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '4') {
      return {
        nextState: 'ATTENDANT',
        responseMessage:
          `Perfeito. Vou te encaminhar para ${doctorName}. Enquanto isso, envie "menu" para voltar ao menu principal.`,
        shouldEnd: false,
      }
    }

    if (option === '0' || normalizedInput === 'encerrar' || normalizedInput === 'sair') {
      return {
        nextState: 'CLOSED',
        responseMessage: 'Conversa encerrada. Quando quiser voltar, envie "menu".',
        shouldEnd: true,
      }
    }

    return {
      nextState: 'MAIN_MENU',
      responseMessage: invalidOptionMessage('MAIN_MENU', doctorName, bookingUrl),
      shouldEnd: false,
    }
  }

  if (input.currentState === 'SERVICES_MENU') {
    if (option === '0' || normalizedInput === 'menu') {
      return {
        nextState: 'MAIN_MENU',
        responseMessage: mainMenuMessage(doctorName),
        shouldEnd: false,
      }
    }

    if (option === '1') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('marcar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '2') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('remarcar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '3') {
      return {
        nextState: 'SERVICES_MENU',
        responseMessage: bookingActionMessage('cancelar', bookingUrl),
        shouldEnd: false,
      }
    }

    if (option === '4') {
      return {
        nextState: 'ATTENDANT',
        responseMessage: `Perfeito. Vou te encaminhar para ${doctorName}.`,
        shouldEnd: false,
      }
    }

    if (normalizedInput === 'encerrar' || normalizedInput === 'sair') {
      return {
        nextState: 'CLOSED',
        responseMessage: 'Conversa encerrada. Quando quiser voltar, envie "menu".',
        shouldEnd: true,
      }
    }

    return {
      nextState: 'SERVICES_MENU',
      responseMessage: invalidOptionMessage('SERVICES_MENU', doctorName, bookingUrl),
      shouldEnd: false,
    }
  }

  if (input.currentState === 'ATTENDANT') {
    if (normalizedInput === 'menu' || option === '0') {
      return {
        nextState: 'MAIN_MENU',
        responseMessage: mainMenuMessage(doctorName),
        shouldEnd: false,
      }
    }

    if (normalizedInput === 'encerrar' || normalizedInput === 'sair') {
      return {
        nextState: 'CLOSED',
        responseMessage: 'Conversa encerrada. Envie "menu" quando quiser retomar.',
        shouldEnd: true,
      }
    }

    return {
      nextState: 'ATTENDANT',
      responseMessage:
        `Recebi sua mensagem e encaminhei para ${doctorName}. Envie "menu" para voltar ao menu principal.`,
      shouldEnd: false,
    }
  }

  if (input.currentState === 'CLOSED') {
    if (normalizedInput === 'menu' || normalizedInput === 'iniciar' || normalizedInput === 'oi') {
      return {
        nextState: 'MAIN_MENU',
        responseMessage: mainMenuMessage(doctorName),
        shouldEnd: false,
      }
    }

    return {
      nextState: 'CLOSED',
      responseMessage: invalidOptionMessage('CLOSED', doctorName, bookingUrl),
      shouldEnd: true,
    }
  }

  return {
    nextState: input.currentState,
    responseMessage: invalidOptionMessage(input.currentState, doctorName, bookingUrl),
    shouldEnd: false,
  }
}
