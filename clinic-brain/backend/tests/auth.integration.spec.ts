import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { app } from '../src/interfaces/http/app'
import { prisma } from '../src/infra/database/prisma/client'

describe('Auth integration', () => {
  const createdEmails: string[] = []
  const createdAdminEmails: string[] = []

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.professional.deleteMany({
        where: {
          email: {
            in: createdEmails,
          },
        },
      })
    }

    if (createdAdminEmails.length > 0) {
      await prisma.adminUser.deleteMany({
        where: {
          email: {
            in: createdAdminEmails,
          },
        },
      })
    }
  })

  it('deve registrar, autenticar e retornar /auth/me', async () => {
    const unique = Date.now().toString()
    const email = `auth.integration.${unique}@clinicbrain.local`
    createdEmails.push(email)

    const registerResponse = await request(app).post('/api/auth/register').send({
      name: 'Profissional Integração Auth',
      email,
      password: 'Senha@123456',
      phoneNumber: '5527991112222',
    })

    expect(registerResponse.status).toBe(201)
    expect(registerResponse.body.accessToken).toBeTypeOf('string')

    const loginResponse = await request(app).post('/api/auth/login').send({
      email,
      password: 'Senha@123456',
    })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.accessToken).toBeTypeOf('string')

    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)

    expect(meResponse.status).toBe(200)
    expect(meResponse.body.professional.email).toBe(email)
  })

  it('deve autenticar admin técnico e bloquear /auth/me de profissional', async () => {
    const unique = Date.now().toString()
    const adminEmail = `admin.integration.${unique}@clinicbrain.local`
    createdAdminEmails.push(adminEmail)

    const passwordHash = await bcrypt.hash('DevAdmin@123456', 10)
    await prisma.adminUser.create({
      data: {
        name: 'Admin Integração',
        email: adminEmail,
        passwordHash,
        isActive: true,
      },
    })

    const adminLoginResponse = await request(app).post('/api/auth/admin/login').send({
      email: adminEmail,
      password: 'DevAdmin@123456',
    })

    expect(adminLoginResponse.status).toBe(200)
    expect(adminLoginResponse.body.accessToken).toBeTypeOf('string')
    expect(adminLoginResponse.body.admin.email).toBe(adminEmail)

    const adminMeResponse = await request(app)
      .get('/api/auth/admin/me')
      .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)

    expect(adminMeResponse.status).toBe(200)
    expect(adminMeResponse.body.admin.email).toBe(adminEmail)

    const professionalMeWithAdminTokenResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)

    expect(professionalMeWithAdminTokenResponse.status).toBe(403)
    expect(professionalMeWithAdminTokenResponse.body.message).toContain('profissionais')
  })
})
