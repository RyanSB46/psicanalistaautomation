import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelPatientAppointment,
  createPatientBooking,
  fetchPatientPortalAppointments,
  fetchPatientPortalAvailability,
  requestPatientOtpCode,
  reschedulePatientActiveAppointment,
  verifyPatientOtpCode,
} from '../../application/services/clinic-api'
import { EmptyState, ErrorState, LoadingState } from '../components/feedback-states'

type PatientPortalPageProps = {
  professionalSlug: string
}

type PortalAction = 'BOOK' | 'RESCHEDULE' | 'CANCEL'

const STORAGE_PREFIX = 'clinic_brain_patient_portal_token:'

function tokenStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function normalizePhone(value: string): string {
  const digits = onlyDigits(value)

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`
  }

  return digits
}

function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 13)
  const local = digits.startsWith('55') ? digits.slice(2) : digits

  if (local.length === 0) {
    return ''
  }

  if (local.length <= 2) {
    return `(${local}`
  }

  if (local.length <= 6) {
    return `(${local.slice(0, 2)}) ${local.slice(2)}`
  }

  if (local.length <= 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }

  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatHour(value: string): string {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildMonthMatrix(reference: Date): Date[][] {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const firstGridDate = new Date(year, month, 1 - offset)

  const rows: Date[][] = []

  for (let week = 0; week < 6; week++) {
    const row: Date[] = []
    for (let day = 0; day < 7; day++) {
      const current = new Date(firstGridDate)
      current.setDate(firstGridDate.getDate() + week * 7 + day)
      row.push(current)
    }
    rows.push(row)
  }

  return rows
}

export function PatientPortalPage({ professionalSlug }: PatientPortalPageProps) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [portalAction, setPortalAction] = useState<PortalAction>('BOOK')
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [professionalNotificationMessage, setProfessionalNotificationMessage] = useState<string | null>(null)
  const [professionalNotificationIsWarning, setProfessionalNotificationIsWarning] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([])
  const [allowMultiCancel, setAllowMultiCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [patientToken, setPatientToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(tokenStorageKey(professionalSlug))
    } catch {
      return null
    }
  })

  function resetPortalSession(message: string) {
    try {
      localStorage.removeItem(tokenStorageKey(professionalSlug))
    } catch {
      // noop
    }

    setPatientToken(null)
    setOtpCode('')
    setSelectedDay('')
    setSelectedSlot('')
    setSelectedAppointmentIds([])
    setAllowMultiCancel(false)
    setCancelReason('')
    setLocalMessage(message)
  }

  const requestCodeMutation = useMutation({
    mutationFn: () =>
      requestPatientOtpCode({
        professionalSlug,
        fullName: fullName.trim(),
        phoneNumber: normalizePhone(phoneNumber),
      }),
    onSuccess: (result) => {
      if (result.deliveryWarning) {
        setLocalMessage(`${result.deliveryWarning} Código local: ${result.devCode ?? '-'}`)
        return
      }

      setLocalMessage(
        result.devCode
          ? `Código enviado. (Ambiente local) use: ${result.devCode}`
          : 'Código enviado com sucesso.',
      )
    },
  })

  const verifyCodeMutation = useMutation({
    mutationFn: () =>
      verifyPatientOtpCode({
        professionalSlug,
        phoneNumber: normalizePhone(phoneNumber),
        code: otpCode,
      }),
    onSuccess: (result) => {
      try {
        localStorage.setItem(tokenStorageKey(professionalSlug), result.accessToken)
      } catch {
        // noop
      }
      setPatientToken(result.accessToken)
      setLocalMessage('Acesso validado com sucesso.')
    },
  })

  const availabilityQuery = useQuery({
    queryKey: ['patient-portal-availability', professionalSlug, patientToken, monthCursor.getFullYear(), monthCursor.getMonth()],
    queryFn: () => fetchPatientPortalAvailability(patientToken as string, monthCursor.getMonth() + 1, monthCursor.getFullYear()),
    enabled: Boolean(patientToken),
    retry: false,
  })

  const appointmentsQuery = useQuery({
    queryKey: ['patient-portal-appointments', professionalSlug, patientToken],
    queryFn: () => fetchPatientPortalAppointments(patientToken as string),
    enabled: Boolean(patientToken),
    retry: false,
  })

  useEffect(() => {
    const availabilityError = availabilityQuery.error?.message ?? ''
    const appointmentsError = appointmentsQuery.error?.message ?? ''

    if (
      availabilityError.includes('Sessão expirada no portal') ||
      appointmentsError.includes('Sessão expirada no portal')
    ) {
      resetPortalSession('Sessão expirada no portal. Solicite um novo código de acesso.')
    }
  }, [availabilityQuery.error, appointmentsQuery.error])

  const bookMutation = useMutation({
    mutationFn: () => {
      const slot = (availabilityQuery.data?.slotsByDay[selectedDay] ?? []).find((item) => item.startsAt === selectedSlot)

      if (!slot) {
        throw new Error('Selecione um horário disponível.')
      }

      return createPatientBooking(patientToken as string, {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })
    },
    onSuccess: async (result) => {
      setLocalMessage(result.message)
      setSelectedSlot('')
      setSelectedDay('')
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-appointments', professionalSlug, patientToken] })
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-availability', professionalSlug, patientToken] })
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      const slot = (availabilityQuery.data?.slotsByDay[selectedDay] ?? []).find((item) => item.startsAt === selectedSlot)

      if (!slot) {
        throw new Error('Selecione um novo horário disponível.')
      }

      return reschedulePatientActiveAppointment(patientToken as string, {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })
    },
    onSuccess: async (result) => {
      setLocalMessage(result.message)
      setSelectedSlot('')
      setSelectedDay('')
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-appointments', professionalSlug, patientToken] })
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-availability', professionalSlug, patientToken] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (selectedAppointmentIds.length === 0) {
        throw new Error('Selecione a consulta que deseja cancelar.')
      }

      const appointmentIdsToCancel = allowMultiCancel ? selectedAppointmentIds : [selectedAppointmentIds[0]]
      let warnings = 0

      for (const appointmentId of appointmentIdsToCancel) {
        const result = await cancelPatientAppointment(patientToken as string, {
          appointmentId,
          reason: cancelReason.trim() || undefined,
        })

        if (result.deliveryWarning) {
          warnings += 1
        }
      }

      return {
        canceledCount: appointmentIdsToCancel.length,
        warnings,
      }
    },
    onSuccess: async (result) => {
      const suffix = result.canceledCount > 1 ? 'consultas canceladas' : 'consulta cancelada'
      setLocalMessage(`${result.canceledCount} ${suffix} com sucesso.`)

      if (result.warnings > 0) {
        setProfessionalNotificationMessage(
          'Cancelamento registrado, mas houve falha ao notificar a profissional em uma ou mais consultas.',
        )
        setProfessionalNotificationIsWarning(true)
      } else {
        setProfessionalNotificationMessage('A profissional foi notificada sobre o cancelamento.')
        setProfessionalNotificationIsWarning(false)
      }

      setSelectedAppointmentIds([])
      setCancelReason('')
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-appointments', professionalSlug, patientToken] })
      await queryClient.invalidateQueries({ queryKey: ['patient-portal-availability', professionalSlug, patientToken] })
    },
    onError: () => {
      setProfessionalNotificationMessage(null)
      setProfessionalNotificationIsWarning(false)
    },
  })

  const canRequestCode = useMemo(
    () => fullName.trim().length >= 5 && normalizePhone(phoneNumber).length >= 12,
    [fullName, phoneNumber],
  )

  const monthRows = useMemo(() => buildMonthMatrix(monthCursor), [monthCursor])
  const availableDays = new Set(availabilityQuery.data?.availableDays ?? [])
  const selectedDaySlots = availabilityQuery.data?.slotsByDay[selectedDay] ?? []

  const activeAppointment = useMemo(() => {
    const items = appointmentsQuery.data ?? []
    return items.length > 0 ? items[0] : null
  }, [appointmentsQuery.data])

  if (!patientToken) {
    return (
      <div className="login-root">
        <form
          className="card login-card"
          onSubmit={(event) => {
            event.preventDefault()
            setLocalMessage(null)
            requestCodeMutation.mutate()
          }}
        >
          <h1>Portal do cliente</h1>
          <p className="muted-text">Profissional: {professionalSlug}</p>

          <label className="field-label" htmlFor="patient-full-name">
            Nome completo
          </label>
          <input
            id="patient-full-name"
            className="field-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Digite seu nome completo"
          />

          <label className="field-label" htmlFor="patient-phone-number">
            Número de telefone
          </label>
          <input
            id="patient-phone-number"
            className="field-input"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(formatPhoneInput(event.target.value))}
            placeholder="(27) 99999-9999"
          />

          <button type="submit" className="primary-button" disabled={!canRequestCode || requestCodeMutation.isPending}>
            {requestCodeMutation.isPending ? 'Enviando código...' : 'Enviar código de acesso'}
          </button>

          <label className="field-label" htmlFor="patient-otp-code">
            Código de acesso (OTP)
          </label>
          <input
            id="patient-otp-code"
            className="field-input"
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />

          <button
            type="button"
            className="secondary-button"
            disabled={otpCode.length !== 6 || verifyCodeMutation.isPending}
            onClick={() => {
              setLocalMessage(null)
              verifyCodeMutation.mutate()
            }}
          >
            {verifyCodeMutation.isPending ? 'Validando...' : 'Entrar no portal'}
          </button>

          {(localMessage || requestCodeMutation.error || verifyCodeMutation.error) && (
            <p className={requestCodeMutation.error || verifyCodeMutation.error ? 'error-text' : 'success-text'}>
              {requestCodeMutation.error?.message ?? verifyCodeMutation.error?.message ?? localMessage}
            </p>
          )}
        </form>
      </div>
    )
  }

  if (availabilityQuery.isLoading || appointmentsQuery.isLoading) {
    return <LoadingState message="Carregando dados do portal..." />
  }

  if (availabilityQuery.isError) {
    return <ErrorState message={availabilityQuery.error.message} onRetry={() => void availabilityQuery.refetch()} />
  }

  if (appointmentsQuery.isError) {
    return <ErrorState message={appointmentsQuery.error.message} onRetry={() => void appointmentsQuery.refetch()} />
  }

  const monthLabel = monthCursor.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="content-area">
      <header className="content-header">
        <h2>Portal do cliente</h2>
        <p className="muted-text">Selecione o que deseja fazer com sua consulta.</p>
      </header>

      <article className="card">
        <h3>Escolha de ação</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className={portalAction === 'BOOK' ? 'primary-button' : 'secondary-button'}
            onClick={() => {
              setPortalAction('BOOK')
              setSelectedDay('')
              setSelectedSlot('')
              setSelectedAppointmentIds([])
              setAllowMultiCancel(false)
              setCancelReason('')
            }}
          >
            Solicitar Novo Agendamento
          </button>
          <button
            type="button"
            className={portalAction === 'RESCHEDULE' ? 'primary-button' : 'secondary-button'}
            onClick={() => {
              setPortalAction('RESCHEDULE')
              setSelectedDay('')
              setSelectedSlot('')
              setSelectedAppointmentIds([])
              setAllowMultiCancel(false)
              setCancelReason('')
            }}
          >
            Remarcar Consulta
          </button>
          <button
            type="button"
            className={portalAction === 'CANCEL' ? 'primary-button' : 'secondary-button'}
            onClick={() => {
              setPortalAction('CANCEL')
              setSelectedDay('')
              setSelectedSlot('')
              setProfessionalNotificationMessage(null)
            }}
          >
            Cancelar Consulta
          </button>
        </div>
      </article>

      {portalAction === 'RESCHEDULE' && !activeAppointment && (
        <EmptyState message="Você não possui consulta ativa para remarcação." />
      )}

      {portalAction === 'RESCHEDULE' && activeAppointment && (
        <article className="card">
          <p>
            Você está remarcando sua consulta do dia {formatDateTime(activeAppointment.startsAt)}.
          </p>
          <p className="muted-text">A nova data será enviada para aprovação da profissional.</p>
        </article>
      )}

      {portalAction === 'CANCEL' && (appointmentsQuery.data?.length ?? 0) === 0 && (
        <EmptyState message="Você não possui consultas ativas para cancelamento." />
      )}

      {portalAction === 'CANCEL' && (appointmentsQuery.data?.length ?? 0) > 0 && (
        <article className="card">
          <h3>Essas são as suas consultas marcadas</h3>
          <p className="muted-text">Qual deseja cancelar?</p>

          <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={allowMultiCancel}
              onChange={(event) => {
                const checked = event.target.checked
                setAllowMultiCancel(checked)

                if (!checked && selectedAppointmentIds.length > 1) {
                  setSelectedAppointmentIds([selectedAppointmentIds[0]])
                }
              }}
            />
            Quero cancelar mais de uma consulta
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {(appointmentsQuery.data ?? []).map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                className={selectedAppointmentIds.includes(appointment.id) ? 'primary-button' : 'secondary-button'}
                onClick={() => {
                  setSelectedAppointmentIds((current) => {
                    if (allowMultiCancel) {
                      if (current.includes(appointment.id)) {
                        return current.filter((id) => id !== appointment.id)
                      }

                      return [...current, appointment.id]
                    }

                    return [appointment.id]
                  })
                }}
              >
                {formatDateTime(appointment.startsAt)}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="cancel-reason" style={{ marginTop: '12px' }}>
            Qual o motivo? (opcional)
          </label>
          <input
            id="cancel-reason"
            className="field-input"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Ex.: imprevisto pessoal"
          />

          <button
            type="button"
            className="primary-button"
            disabled={selectedAppointmentIds.length === 0 || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
            style={{ marginTop: '12px' }}
          >
            {cancelMutation.isPending
              ? 'Cancelando...'
              : allowMultiCancel
                ? 'Confirmar Cancelamento das Selecionadas'
                : 'Confirmar Cancelamento'}
          </button>
        </article>
      )}

      {portalAction !== 'CANCEL' && (
        <article className="card">
        <h3>Disponibilidade</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const previous = new Date(monthCursor)
              previous.setMonth(previous.getMonth() - 1)
              setMonthCursor(new Date(previous.getFullYear(), previous.getMonth(), 1))
              setSelectedDay('')
              setSelectedSlot('')
            }}
          >
            Mês anterior
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = new Date(monthCursor)
              next.setMonth(next.getMonth() + 1)
              setMonthCursor(new Date(next.getFullYear(), next.getMonth(), 1))
              setSelectedDay('')
              setSelectedSlot('')
            }}
          >
            Próximo mês
          </button>
        </div>

        <div className="calendar-grid" style={{ marginTop: '10px' }}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
            <div key={label} className="calendar-head">
              {label}
            </div>
          ))}

          {monthRows.flat().map((date) => {
            const dayKey = toDayKey(date)
            const isCurrentMonth = date.getMonth() === monthCursor.getMonth()
            const isAvailable = isCurrentMonth && availableDays.has(dayKey)
            const isSelected = selectedDay === dayKey

            return (
              <button
                key={dayKey}
                type="button"
                className={
                  isCurrentMonth
                    ? isSelected
                      ? 'calendar-cell nav-item-active'
                      : 'calendar-cell'
                    : 'calendar-cell calendar-cell-muted'
                }
                onClick={() => {
                  if (!isAvailable) {
                    return
                  }
                  setSelectedDay(dayKey)
                  setSelectedSlot('')
                }}
                disabled={!isAvailable}
                style={{ cursor: isAvailable ? 'pointer' : 'not-allowed' }}
              >
                <span>{date.getDate()}</span>
                {isAvailable && <small>Disponível</small>}
              </button>
            )
          })}
        </div>
        </article>
      )}

      {portalAction !== 'CANCEL' && selectedDay.length > 0 && (
        <article className="card">
          <h3>Qual horário você deseja?</h3>
          {selectedDaySlots.length === 0 ? (
            <EmptyState message="Não há horários disponíveis neste dia." />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {selectedDaySlots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  className={selectedSlot === slot.startsAt ? 'primary-button' : 'secondary-button'}
                  onClick={() => setSelectedSlot(slot.startsAt)}
                >
                  {formatHour(slot.startsAt)}
                </button>
              ))}
            </div>
          )}

          {portalAction === 'BOOK' && (
            <button
              type="button"
              className="primary-button"
              disabled={!selectedSlot || bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
              style={{ marginTop: '12px' }}
            >
              {bookMutation.isPending ? 'Confirmando...' : 'Confirmar Agendamento'}
            </button>
          )}

          {portalAction === 'RESCHEDULE' && (
            <button
              type="button"
              className="primary-button"
              disabled={!selectedSlot || !activeAppointment || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
              style={{ marginTop: '12px' }}
            >
              {rescheduleMutation.isPending ? 'Enviando solicitação...' : 'Solicitar Remarcação'}
            </button>
          )}
        </article>
      )}

      {(localMessage || bookMutation.error || rescheduleMutation.error || cancelMutation.error) && (
        <article className="card">
          <p className={bookMutation.error || rescheduleMutation.error || cancelMutation.error ? 'error-text' : 'success-text'}>
            {bookMutation.error?.message ?? rescheduleMutation.error?.message ?? cancelMutation.error?.message ?? localMessage}
          </p>
        </article>
      )}

      {professionalNotificationMessage && (
        <article className="card">
          <p className={professionalNotificationIsWarning ? 'error-text' : 'success-text'}>
            {professionalNotificationMessage}
          </p>
        </article>
      )}

      <article className="card">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            try {
              localStorage.removeItem(tokenStorageKey(professionalSlug))
            } catch {
              // noop
            }
            setPatientToken(null)
            setOtpCode('')
            setLocalMessage(null)
            setSelectedDay('')
            setSelectedSlot('')
            setSelectedAppointmentIds([])
            setAllowMultiCancel(false)
            setCancelReason('')
            setProfessionalNotificationMessage(null)
            setProfessionalNotificationIsWarning(false)
          }}
        >
          Sair do portal do cliente
        </button>
      </article>
    </div>
  )
}
