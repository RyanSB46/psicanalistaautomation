export type AdminUser = {
  id: string
  name: string
  email: string
  passwordHash: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
