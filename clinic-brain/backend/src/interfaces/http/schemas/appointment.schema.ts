import { z } from 'zod'

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
})

export const rescheduleAppointmentSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
})

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

export const manualAppointmentActionSchema = z
  .object({
    action: z.enum(['BOOK', 'RESCHEDULE', 'CANCEL']),
    appointmentId: z.string().min(1).optional(),
    patient: z.object({
      name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres'),
      phoneNumber: z.string().trim().min(10, 'Telefone inválido'),
      email: z.string().trim().email('Email inválido').optional(),
    }),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
    message: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if ((value.action === 'RESCHEDULE' || value.action === 'CANCEL') && !value.appointmentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appointmentId'],
        message: 'appointmentId é obrigatório para esta ação',
      })
    }

    if ((value.action === 'BOOK' || value.action === 'RESCHEDULE') && (!value.startsAt || !value.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startsAt'],
        message: 'startsAt e endsAt são obrigatórios para esta ação',
      })
    }
  })

export const createAvailabilityBlockSchema = z
  .object({
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    const from = new Date(`${value.fromDate}T00:00:00`)
    const to = new Date(`${value.toDate}T00:00:00`)

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Período de bloqueio inválido',
      })
      return
    }

    if (to < from) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toDate'],
        message: 'toDate deve ser maior ou igual a fromDate',
      })
    }

    const startsAt = new Date(`${value.fromDate}T${value.startTime}:00`)
    const endsAt = new Date(`${value.fromDate}T${value.endTime}:00`)

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime deve ser maior que startTime',
      })
    }
  })
