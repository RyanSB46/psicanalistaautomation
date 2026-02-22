import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPatient, fetchPatients } from '../../application/services/clinic-api'
import { EmptyState, ErrorState, LoadingState } from '../components/feedback-states'

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

export function PatientsPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const patientsQuery = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
  })

  const createPatientMutation = useMutation({
    mutationFn: () =>
      createPatient({
        name: name.trim(),
        phoneNumber: normalizePhone(phoneNumber),
        email: email.trim() || undefined,
      }),
    onSuccess: async () => {
      setName('')
      setPhoneNumber('')
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })

  function validateForm(): boolean {
    if (name.trim().length < 2) {
      setFormError('Informe o nome com ao menos 2 caracteres.')
      return false
    }

    if (normalizePhone(phoneNumber).length < 10) {
      setFormError('Informe um telefone válido com DDD.')
      return false
    }

    if (email.trim().length > 0 && !email.includes('@')) {
      setFormError('Email inválido.')
      return false
    }

    setFormError(null)
    return true
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    createPatientMutation.mutate()
  }

  return (
    <section className="split-grid">
      <article className="card">
        <h3>Cadastrar paciente</h3>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="patient-name">
            Nome
          </label>
          <input
            id="patient-name"
            className="field-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <label className="field-label" htmlFor="patient-phone">
            Telefone
          </label>
          <input
            id="patient-phone"
            className="field-input"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="(27) 99999-9999"
          />

          <label className="field-label" htmlFor="patient-email">
            Email (opcional)
          </label>
          <input
            id="patient-email"
            className="field-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          {(formError || createPatientMutation.error) && (
            <p className="error-text">{formError ?? createPatientMutation.error?.message}</p>
          )}

          <button type="submit" className="primary-button" disabled={createPatientMutation.isPending}>
            {createPatientMutation.isPending ? 'Salvando...' : 'Salvar paciente'}
          </button>
        </form>
      </article>

      <article className="card">
        <h3>Pacientes cadastrados</h3>

        {patientsQuery.isLoading && <LoadingState message="Carregando pacientes..." />}

        {patientsQuery.isError && (
          <ErrorState
            message={patientsQuery.error.message}
            onRetry={() => {
              void patientsQuery.refetch()
            }}
          />
        )}

        {!patientsQuery.isLoading && !patientsQuery.isError && (patientsQuery.data?.length ?? 0) === 0 && (
          <EmptyState message="Nenhum paciente cadastrado." />
        )}

        {!patientsQuery.isLoading && !patientsQuery.isError && (patientsQuery.data?.length ?? 0) > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {patientsQuery.data?.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.name}</td>
                    <td>{patient.phoneNumber}</td>
                    <td>{patient.email || '-'}</td>
                    <td>{patient.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
