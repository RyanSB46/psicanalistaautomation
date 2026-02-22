import { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../../../infra/security/jwt'

export function authMiddleware(request: Request, response: Response, next: NextFunction) {
  const authorization = request.headers.authorization

  if (!authorization) {
    return response.status(401).json({ message: 'Token ausente' })
  }

  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ message: 'Formato de token inválido' })
  }

  try {
    const payload = verifyAccessToken(token)

    if (!payload.sub) {
      return response.status(401).json({ message: 'Token inválido' })
    }

    const role = payload.role === 'ADMIN' ? 'ADMIN' : payload.role === 'PATIENT' ? 'PATIENT' : 'PROFESSIONAL'

    if ((role === 'ADMIN' || role === 'PROFESSIONAL') && !payload.email) {
      return response.status(401).json({ message: 'Token inválido' })
    }

    request.authUser = {
      id: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role,
      professionalId: typeof payload.professionalId === 'string' ? payload.professionalId : undefined,
      patientId: typeof payload.patientId === 'string' ? payload.patientId : undefined,
      phoneNumber: typeof payload.phoneNumber === 'string' ? payload.phoneNumber : undefined,
    }

    return next()
  } catch {
    return response.status(401).json({ message: 'Token inválido ou expirado' })
  }
}
