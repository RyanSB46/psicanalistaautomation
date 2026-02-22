import { z } from 'zod'

export const reviewPatientRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(300).optional(),
})
