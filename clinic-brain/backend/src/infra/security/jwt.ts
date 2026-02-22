import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'

type AccessTokenPayload = {
  sub: string
  email?: string
  role: 'PROFESSIONAL' | 'ADMIN' | 'PATIENT'
  professionalId?: string
  patientId?: string
  phoneNumber?: string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    subject: payload.sub,
  }

  return jwt.sign(
    {
      email: payload.email,
      role: payload.role,
      professionalId: payload.professionalId,
      patientId: payload.patientId,
      phoneNumber: payload.phoneNumber,
    },
    env.JWT_SECRET,
    options,
  )
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload
}
