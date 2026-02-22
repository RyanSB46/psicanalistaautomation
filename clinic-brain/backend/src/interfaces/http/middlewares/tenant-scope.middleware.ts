import { NextFunction, Request, Response } from 'express'

export function tenantScopeMiddleware(request: Request, response: Response, next: NextFunction) {
  if (!request.authUser?.id) {
    return response.status(401).json({ message: 'Usuário não autenticado' })
  }

  if (request.authUser.role !== 'PROFESSIONAL') {
    return response.status(403).json({ message: 'Acesso permitido apenas para profissionais' })
  }

  request.professionalId = request.authUser.id
  return next()
}
