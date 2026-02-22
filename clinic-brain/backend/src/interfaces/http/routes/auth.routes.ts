import { Router } from 'express'
import { registerProfessional } from '../../../application/use-cases/auth/register-professional.use-case'
import { loginProfessional } from '../../../application/use-cases/auth/login-professional.use-case'
import { getAuthMe } from '../../../application/use-cases/auth/get-auth-me.use-case'
import { loginAdmin } from '../../../application/use-cases/auth/login-admin.use-case'
import { getAuthAdminMe } from '../../../application/use-cases/auth/get-auth-admin-me.use-case'
import { authMiddleware } from '../middlewares/auth.middleware'
import { tenantScopeMiddleware } from '../middlewares/tenant-scope.middleware'
import { validateBody } from '../middlewares/validate-body.middleware'
import { loginSchema, registerSchema } from '../schemas/auth.schema'

export const authRoutes = Router()

authRoutes.post('/auth/register', validateBody(registerSchema), async (request, response, next) => {
  try {
    const result = await registerProfessional(request.body)
    return response.status(201).json(result)
  } catch (error) {
    return next(error)
  }
})

authRoutes.post('/auth/login', validateBody(loginSchema), async (request, response, next) => {
  try {
    const result = await loginProfessional(request.body)
    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})

authRoutes.post('/auth/admin/login', validateBody(loginSchema), async (request, response, next) => {
  try {
    const result = await loginAdmin(request.body)
    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})

authRoutes.get('/auth/me', authMiddleware, tenantScopeMiddleware, async (request, response, next) => {
  try {
    const result = await getAuthMe(request.professionalId as string)
    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})

authRoutes.get('/auth/admin/me', authMiddleware, async (request, response, next) => {
  try {
    if (request.authUser?.role !== 'ADMIN') {
      return response.status(403).json({ message: 'Acesso permitido apenas para admins' })
    }

    const result = await getAuthAdminMe(request.authUser.id)
    return response.status(200).json(result)
  } catch (error) {
    return next(error)
  }
})
