import { NextFunction, Request, Response } from 'express'

export function patientAuthMiddleware(request: Request, response: Response, next: NextFunction) {
  if (!request.authUser?.id) {
    return response.status(401).json({ message: 'Usuário não autenticado' })
  }

  if (request.authUser.role !== 'PATIENT') {
    return response.status(403).json({ message: 'Acesso permitido apenas para pacientes' })
  }

  if (!request.authUser.professionalId || !request.authUser.patientId) {
    return response.status(401).json({ message: 'Token de paciente inválido' })
  }

  request.professionalId = request.authUser.professionalId
  request.patientId = request.authUser.patientId

  return next()
}
