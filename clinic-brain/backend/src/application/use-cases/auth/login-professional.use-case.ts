import { AppError } from '../../errors/app-error'
import { professionalRepository } from '../../../infra/database/repositories/professional.repository'
import { comparePassword } from '../../../infra/security/password'
import { signAccessToken } from '../../../infra/security/jwt'

type LoginProfessionalInput = {
  email: string
  password: string
}

type LoginProfessionalResult = {
  accessToken: string
  professional: {
    id: string
    name: string
    email: string
  }
}

export async function loginProfessional(input: LoginProfessionalInput): Promise<LoginProfessionalResult> {
  const professional = await professionalRepository.findByEmail(input.email)

  if (!professional) {
    throw new AppError('Credenciais inválidas', 401)
  }

  const passwordMatches = await comparePassword(input.password, professional.passwordHash)

  if (!passwordMatches) {
    throw new AppError('Credenciais inválidas', 401)
  }

  const accessToken = signAccessToken({
    sub: professional.id,
    email: professional.email,
    role: 'PROFESSIONAL',
  })

  return {
    accessToken,
    professional: {
      id: professional.id,
      name: professional.name,
      email: professional.email,
    },
  }
}
