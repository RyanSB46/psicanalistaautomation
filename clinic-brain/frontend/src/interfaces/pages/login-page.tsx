import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { login, loginAdmin } from '../../application/services/clinic-api'

type LoginPageProps = {
  onLoginSuccess: (token: string) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginType, setLoginType] = useState<'PROFESSIONAL' | 'ADMIN'>('PROFESSIONAL')
  const [email, setEmail] = useState('ana.silva@clinicbrain.local')
  const [password, setPassword] = useState('Admin@123456')
  const [localError, setLocalError] = useState<string | null>(null)

  const loginMutation = useMutation<{ accessToken: string }, Error>({
    mutationFn: () =>
      (loginType === 'ADMIN' ? loginAdmin(email, password) : login(email, password)).then((result) => ({
        accessToken: result.accessToken,
      })),
    onSuccess: (result) => {
      onLoginSuccess(result.accessToken)
    },
  })

  const disabled = useMemo(
    () => loginMutation.isPending || email.trim().length === 0 || password.trim().length < 6,
    [email, password, loginMutation.isPending],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (!email.includes('@')) {
      setLocalError('Informe um email válido.')
      return
    }

    if (password.trim().length < 6) {
      setLocalError('Senha precisa ter ao menos 6 caracteres.')
      return
    }

    loginMutation.mutate()
  }

  return (
    <div className="login-root">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>Clinic Brain</h1>
        <p className="muted-text">
          {loginType === 'ADMIN'
            ? 'Acesse como admin técnico.'
            : 'Acesse sua conta profissional para gerenciar agenda e pacientes.'}
        </p>

        <label className="field-label" htmlFor="login-type">
          Tipo de acesso
        </label>
        <select
          id="login-type"
          className="field-input"
          value={loginType}
          onChange={(event) => {
            const nextType = event.target.value as 'PROFESSIONAL' | 'ADMIN'
            setLoginType(nextType)

            if (nextType === 'ADMIN') {
              setEmail('admin.tecnico@clinicbrain.local')
              setPassword('DevAdmin@123456')
              return
            }

            setEmail('ana.silva@clinicbrain.local')
            setPassword('Admin@123456')
          }}
        >
          <option value="PROFESSIONAL">Profissional</option>
          <option value="ADMIN">Admin técnico</option>
        </select>

        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="field-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />

        <label className="field-label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          className="field-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        {(localError || loginMutation.error) && (
          <p className="error-text">{localError ?? loginMutation.error?.message ?? 'Falha ao fazer login.'}</p>
        )}

        <button type="submit" className="primary-button" disabled={disabled}>
          {loginMutation.isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
