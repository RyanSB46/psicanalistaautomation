import { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../application/errors/app-error'
import { env } from '../../../infra/config/env'

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next

  const requestId = req.id ?? null

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      requestId,
    })
  }

  if (error instanceof Error) {
    return res.status(500).json({
      message: 'Internal server error',
      details: env.NODE_ENV === 'development' ? error.message : undefined,
      requestId,
    })
  }

  return res.status(500).json({
    message: 'Internal server error',
    requestId,
  })
}
