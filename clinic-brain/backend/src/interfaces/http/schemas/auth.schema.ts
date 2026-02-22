import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  password: z.string().min(8).max(128),
  phoneNumber: z.string().min(8).max(20).optional(),
})

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
})

export type RegisterSchema = z.infer<typeof registerSchema>
export type LoginSchema = z.infer<typeof loginSchema>
