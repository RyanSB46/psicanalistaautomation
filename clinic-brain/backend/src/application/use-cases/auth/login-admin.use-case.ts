import { AppError } from '../../errors/app-error'
import { adminUserRepository } from '../../../infra/database/repositories/admin-user.repository'
import { comparePassword } from '../../../infra/security/password'
import { signAccessToken } from '../../../infra/security/jwt'

type LoginAdminInput = {
  email: string
  password: string
}

type LoginAdminResult = {
  accessToken: string
  admin: {
    id: string
    name: string
    email: string
  }
}

export async function loginAdmin(input: LoginAdminInput): Promise<LoginAdminResult> {
  const admin = await adminUserRepository.findByEmail(input.email)

  if (!admin || !admin.isActive) {
    throw new AppError('Credenciais inválidas', 401)
  }

  const passwordMatches = await comparePassword(input.password, admin.passwordHash)

  if (!passwordMatches) {
    throw new AppError('Credenciais inválidas', 401)
  }

  const accessToken = signAccessToken({
    sub: admin.id,
    email: admin.email,
    role: 'ADMIN',
  })

  return {
    accessToken,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
    },
  }
}
