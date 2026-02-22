import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchSettingsFeatures,
  fetchSettingsMessages,
  updateSettingsFeatures,
  updateSettingsMessages,
  type ProfessionalFeatureFlags,
} from '../../application/services/clinic-api'
import { ErrorState, LoadingState } from '../components/feedback-states'
import {
  applyThemePreference,
  resolveInitialThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../shared/theme/theme-preference'

export function SettingsPage() {
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [cancellationPolicy, setCancellationPolicy] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => resolveInitialThemePreference())
  const [themeSaved, setThemeSaved] = useState(false)
  const [features, setFeatures] = useState<ProfessionalFeatureFlags | null>(null)
  const [featuresSaved, setFeaturesSaved] = useState(false)
  const [featuresError, setFeaturesError] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['settings-messages'],
    queryFn: fetchSettingsMessages,
  })

  const featuresQuery = useQuery({
    queryKey: ['settings-features'],
    queryFn: fetchSettingsFeatures,
  })

  useEffect(() => {
    if (settingsQuery.data) {
      setWelcomeMessage(settingsQuery.data.welcomeMessage ?? '')
      setConfirmationMessage(settingsQuery.data.confirmationMessage ?? '')
      setCancellationPolicy(settingsQuery.data.cancellationPolicy ?? '')
    }
  }, [settingsQuery.data])

  useEffect(() => {
    if (featuresQuery.data) {
      setFeatures(featuresQuery.data)
    }
  }, [featuresQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSettingsMessages({
        welcomeMessage: welcomeMessage.trim(),
        confirmationMessage: confirmationMessage.trim(),
        cancellationPolicy: cancellationPolicy.trim(),
      }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const saveFeaturesMutation = useMutation({
    mutationFn: (input: Partial<ProfessionalFeatureFlags>) => updateSettingsFeatures(input),
    onSuccess: (result) => {
      setFeatures(result)
      setFeaturesSaved(true)
      setTimeout(() => setFeaturesSaved(false), 2500)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (welcomeMessage.trim().length === 0) {
      setLocalError('A mensagem de boas-vindas é obrigatória.')
      return
    }

    if (confirmationMessage.trim().length === 0) {
      setLocalError('A mensagem de confirmação é obrigatória.')
      return
    }

    saveMutation.mutate()
  }

  if (settingsQuery.isLoading) {
    return <LoadingState message="Carregando configurações..." />
  }

  if (settingsQuery.isError) {
    return (
      <ErrorState
        message={settingsQuery.error.message}
        onRetry={() => {
          void settingsQuery.refetch()
        }}
      />
    )
  }

  if (featuresQuery.isLoading) {
    return <LoadingState message="Carregando configurações de funcionalidades..." />
  }

  if (featuresQuery.isError) {
    return (
      <ErrorState
        message={featuresQuery.error.message}
        onRetry={() => {
          void featuresQuery.refetch()
        }}
      />
    )
  }

  function handleThemeChange(nextTheme: ThemePreference) {
    setThemePreference(nextTheme)
    applyThemePreference(nextTheme)
    saveThemePreference(nextTheme)
    setThemeSaved(true)
    setTimeout(() => setThemeSaved(false), 2500)
  }

  function handleFeatureToggle(key: keyof ProfessionalFeatureFlags, value: boolean) {
    if (!features) {
      return
    }

    setFeaturesError(null)

    if (key === 'settingsEnabled' && !value) {
      setFeaturesError('A funcionalidade de Configurações não pode ser desativada nesta tela.')
      return
    }

    setFeatures((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        [key]: value,
      }
    })

    saveFeaturesMutation.mutate({
      [key]: value,
    })
  }

  const renderedFeatures = features ?? featuresQuery.data

  return (
    <section className="reports-grid">
      <article className="card">
        <h3>Aparência</h3>
        <p className="muted-text">Escolha entre tema claro e escuro para o painel.</p>

        <div className="form-grid">
          <label className="field-label" htmlFor="theme-preference">
            Tema
          </label>
          <select
            id="theme-preference"
            className="field-input"
            value={themePreference}
            onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>

          {themeSaved && <p className="success-text">Tema atualizado com sucesso.</p>}
        </div>
      </article>

      <article className="card">
        <h3>Mensagens padrão do chatbot</h3>
        <p className="muted-text">Esses textos são usados como base nas interações automáticas com pacientes.</p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="welcome-message">
            Mensagem de boas-vindas
          </label>
          <textarea
            id="welcome-message"
            className="field-textarea"
            value={welcomeMessage}
            onChange={(event) => setWelcomeMessage(event.target.value)}
            rows={3}
          />

          <label className="field-label" htmlFor="confirmation-message">
            Mensagem de confirmação
          </label>
          <textarea
            id="confirmation-message"
            className="field-textarea"
            value={confirmationMessage}
            onChange={(event) => setConfirmationMessage(event.target.value)}
            rows={3}
          />

          <label className="field-label" htmlFor="cancellation-policy">
            Política de cancelamento
          </label>
          <textarea
            id="cancellation-policy"
            className="field-textarea"
            value={cancellationPolicy}
            onChange={(event) => setCancellationPolicy(event.target.value)}
            rows={4}
          />

          {(localError || saveMutation.error) && (
            <p className="error-text">{localError ?? saveMutation.error?.message}</p>
          )}

          {saved && <p className="success-text">Configurações salvas com sucesso.</p>}

          <button type="submit" className="primary-button" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </form>
      </article>

      <article className="card">
        <h3>Funcionalidades por profissional (MVP)</h3>
        <p className="muted-text">Ative ou desative os módulos principais para esta conta profissional.</p>

        {renderedFeatures ? (
          <div className="form-grid">
            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.dashboardEnabled}
                onChange={(event) => handleFeatureToggle('dashboardEnabled', event.target.checked)}
              />
              Dashboard
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.agendaEnabled}
                onChange={(event) => handleFeatureToggle('agendaEnabled', event.target.checked)}
              />
              Agenda
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.manualActionEnabled}
                onChange={(event) => handleFeatureToggle('manualActionEnabled', event.target.checked)}
                disabled={!renderedFeatures.agendaEnabled}
              />
              Ações manuais na agenda
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.patientsEnabled}
                onChange={(event) => handleFeatureToggle('patientsEnabled', event.target.checked)}
              />
              Pacientes
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.reportsEnabled}
                onChange={(event) => handleFeatureToggle('reportsEnabled', event.target.checked)}
              />
              Relatórios
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.requestsEnabled}
                onChange={(event) => handleFeatureToggle('requestsEnabled', event.target.checked)}
              />
              Solicitações
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.settingsEnabled}
                onChange={(event) => handleFeatureToggle('settingsEnabled', event.target.checked)}
              />
              Configurações
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.patientPortalEnabled}
                onChange={(event) => handleFeatureToggle('patientPortalEnabled', event.target.checked)}
              />
              Portal do paciente
            </label>

            <label className="status-chip">
              <input
                type="checkbox"
                checked={renderedFeatures.webhookEnabled}
                onChange={(event) => handleFeatureToggle('webhookEnabled', event.target.checked)}
              />
              Webhook
            </label>

            {(featuresError || saveFeaturesMutation.error) && (
              <p className="error-text">{featuresError ?? saveFeaturesMutation.error?.message}</p>
            )}

            {featuresSaved && <p className="success-text">Funcionalidades atualizadas com sucesso.</p>}
          </div>
        ) : null}
      </article>
    </section>
  )
}
