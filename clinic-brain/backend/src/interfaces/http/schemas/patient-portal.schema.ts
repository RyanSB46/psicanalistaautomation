import { z } from 'zod'

const phoneRegex = /^\d{10,13}$/

export const requestPatientOtpCodeSchema = z.object({
  professionalSlug: z.string().min(2).max(80),
  fullName: z.string().min(5).max(120),
  phoneNumber: z.string().transform((value) => value.replace(/\D/g, '')).refine((value) => phoneRegex.test(value), {
    message: 'Telefone inválido',
  }),
})

export const verifyPatientOtpCodeSchema = z.object({
  professionalSlug: z.string().min(2).max(80),
  phoneNumber: z.string().transform((value) => value.replace(/\D/g, '')).refine((value) => phoneRegex.test(value), {
    message: 'Telefone inválido',
  }),
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
})

export const patientBookingRequestSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})

export const patientRescheduleRequestSchema = z.object({
  appointmentId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})

export const patientCancelRequestSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(300).optional(),
})
