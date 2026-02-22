import { AppError } from '../../errors/app-error'
import { professionalRepository } from '../../../infra/database/repositories/professional.repository'

type GetAuthMeResult = {
  professional: {
    id: string
    name: string
    email: string
  }
}

export async function getAuthMe(professionalId: string): Promise<GetAuthMeResult> {
  const professional = await professionalRepository.findById(professionalId)

  if (!professional) {
    throw new AppError('Profissional não encontrado', 404)
  }

  return {
    professional: {
      id: professional.id,
      name: professional.name,
      email: professional.email,
    },
  }
}
