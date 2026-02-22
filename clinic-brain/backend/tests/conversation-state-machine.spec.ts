import { describe, expect, it } from 'vitest'
import { runConversationStateMachine } from '../src/domain/services/conversation-state-machine'

describe('Conversation state machine', () => {
  it('deve abrir no menu principal ao sair de INITIAL', () => {
    const result = runConversationStateMachine({
      currentState: 'INITIAL',
      userInput: 'oi',
      doctorName: 'Dra. Ana Silva',
      bookingUrl: 'http://localhost:5173',
    })

    expect(result.nextState).toBe('MAIN_MENU')
    expect(result.shouldEnd).toBe(false)
    expect(result.responseMessage).toContain('Dra. Ana Silva')
  })

  it('deve encaminhar para atendimento humano na opção 4', () => {
    const result = runConversationStateMachine({
      currentState: 'MAIN_MENU',
      userInput: '4',
      doctorName: 'Dra. Ana Silva',
      bookingUrl: 'http://localhost:5173',
    })

    expect(result.nextState).toBe('ATTENDANT')
    expect(result.shouldEnd).toBe(false)
    expect(result.responseMessage).toContain('encaminhar para Dra. Ana Silva')
  })

  it('deve responder com link de agendamento para intenção de marcar', () => {
    const result = runConversationStateMachine({
      currentState: 'MAIN_MENU',
      userInput: 'quero marcar consulta',
      doctorName: 'Dra. Ana Silva',
      bookingUrl: 'http://localhost:5173/agendar',
    })

    expect(result.nextState).toBe('SERVICES_MENU')
    expect(result.shouldEnd).toBe(false)
    expect(result.responseMessage).toContain('http://localhost:5173/agendar')
  })
})
