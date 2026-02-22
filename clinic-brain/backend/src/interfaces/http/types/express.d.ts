declare namespace Express {
  interface Request {
    id?: string
    authUser?: {
      id: string
      email?: string
      role: 'PROFESSIONAL' | 'ADMIN' | 'PATIENT'
      professionalId?: string
      patientId?: string
      phoneNumber?: string
    }
    professionalId?: string
    patientId?: string
  }
}
