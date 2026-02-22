import { z } from 'zod'

export const createPatientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres'),
  phoneNumber: z.string().trim().min(10, 'Telefone inválido'),
  email: z.string().email('Email inválido').optional(),
})
