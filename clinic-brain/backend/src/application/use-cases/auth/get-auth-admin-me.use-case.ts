import { AppError } from '../../errors/app-error'
import { adminUserRepository } from '../../../infra/database/repositories/admin-user.repository'

type GetAuthAdminMeResult = {
  admin: {
    id: string
    name: string
    email: string
  }
}

export async function getAuthAdminMe(adminId: string): Promise<GetAuthAdminMeResult> {
  const admin = await adminUserRepository.findById(adminId)

  if (!admin || !admin.isActive) {
    throw new AppError('Admin não encontrado', 404)
  }

  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
    },
  }
}
