import { Professional } from '../../../domain/entities/professional'
import { prisma } from '../prisma/client'

type CreateProfessionalInput = {
  name: string
  email: string
  passwordHash: string
  phoneNumber?: string
}

function mapProfessional(model: {
  id: string
  name: string
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}): Professional {
  return {
    id: model.id,
    name: model.name,
    email: model.email,
    passwordHash: model.passwordHash,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

export const professionalRepository = {
  async findByEmail(email: string): Promise<Professional | null> {
    const professional = await prisma.professional.findUnique({
      where: { email },
    })

    if (!professional) {
      return null
    }

    return mapProfessional(professional)
  },

  async findById(id: string): Promise<Professional | null> {
    const professional = await prisma.professional.findUnique({
      where: { id },
    })

    if (!professional) {
      return null
    }

    return mapProfessional(professional)
  },

  async create(input: CreateProfessionalInput): Promise<Professional> {
    const professional = await prisma.professional.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        phoneNumber: input.phoneNumber,
      },
    })

    return mapProfessional(professional)
  },
}
