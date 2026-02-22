import { AppError } from '../../errors/app-error'
import { professionalRepository } from '../../../infra/database/repositories/professional.repository'
import { hashPassword } from '../../../infra/security/password'
import { signAccessToken } from '../../../infra/security/jwt'

type RegisterProfessionalInput = {
  name: string
  email: string
  password: string
  phoneNumber?: string
}

type RegisterProfessionalResult = {
  accessToken: string
  professional: {
    id: string
    name: string
    email: string
  }
}

export async function registerProfessional(
  input: RegisterProfessionalInput,
): Promise<RegisterProfessionalResult> {
  const existingProfessional = await professionalRepository.findByEmail(input.email)

  if (existingProfessional) {
    throw new AppError('Email já está em uso', 409)
  }

  const passwordHash = await hashPassword(input.password)
  const professional = await professionalRepository.create({
    name: input.name,
    email: input.email,
    passwordHash,
    phoneNumber: input.phoneNumber,
  })

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
