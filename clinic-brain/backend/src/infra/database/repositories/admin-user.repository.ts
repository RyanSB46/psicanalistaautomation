import { AdminUser } from '../../../domain/entities/admin-user'
import { prisma } from '../prisma/client'

function mapAdminUser(model: {
  id: string
  name: string
  email: string
  passwordHash: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): AdminUser {
  return {
    id: model.id,
    name: model.name,
    email: model.email,
    passwordHash: model.passwordHash,
    isActive: model.isActive,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

export const adminUserRepository = {
  async findByEmail(email: string): Promise<AdminUser | null> {
    const adminUser = await prisma.adminUser.findUnique({
      where: { email },
    })

    if (!adminUser) {
      return null
    }

    return mapAdminUser(adminUser)
  },

  async findById(id: string): Promise<AdminUser | null> {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id },
    })

    if (!adminUser) {
      return null
    }

    return mapAdminUser(adminUser)
  },
}
