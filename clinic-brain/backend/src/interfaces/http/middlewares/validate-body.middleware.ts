import { NextFunction, Request, Response } from 'express'
import { ZodSchema } from 'zod'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (request: Request, response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({
        message: 'Payload inválido',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    request.body = parsed.data
    return next()
  }
}
