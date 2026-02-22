import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AvailabilityBlockItem,
  type AppointmentListItem,
  createAvailabilityBlocks,
  deleteAvailabilityBlock,
  executeManualAppointmentAction,
  fetchAvailabilityBlocks,
  fetchAppointments,
  fetchPatients,
} from '../../application/services/clinic-api'
import { EmptyState, ErrorState, LoadingState } from '../components/feedback-states'

type StatusFilter = AppointmentListItem['status']
type PeriodFilter = 'ALL' | 'TODAY' | 'THIS_MONTH' | 'CUSTOM' | 'FROM_DATE'
type ShiftFilter = 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING'
type ManualAction = 'BOOK' | 'RESCHEDULE' | 'CANCEL'

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', {
    dateStyle: 'short',
  })
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const end = new Date(endsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${start} às ${end}`
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function toCalendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toDateOnly(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function formatStatus(status: AppointmentListItem['status']): string {
  switch (status) {
    case 'AGENDADO':
      return 'Agendado'
    case 'CONFIRMADO':
      return 'Confirmado'
    case 'CANCELADO':
      return 'Cancelado'
    case 'FALTOU':
      return 'Faltou'
    case 'REMARCADO':
      return 'Remarcado'
    default:
      return status
  }
}

function parseCancellationMeta(notes?: string | null): { canceledAt?: string; reason?: string | null } | null {
  if (!notes) {
    return null
  }

  try {
    const parsed = JSON.parse(notes) as {
      cancellation?: {
        canceledAt?: string
        reason?: string | null
      }
    }

    return parsed.cancellation ?? null
  } catch {
    return null
  }
}

function renderAppointmentDetails(appointment: AppointmentListItem): string[] {
  const details: string[] = []

  if (appointment.status === 'AGENDADO' || appointment.status === 'CONFIRMADO') {
    details.push(`Solicitado em: ${formatDateTime(appointment.createdAt)}`)

    if (appointment.rescheduledFrom) {
      details.push(`Remarcado de: ${formatDateTime(appointment.rescheduledFrom.startsAt)} para ${formatDateTime(appointment.startsAt)}`)
      details.push(`Data da remarcação: ${formatDateTime(appointment.createdAt)}`)
    }
  }

  if (appointment.status === 'REMARCADO') {
    const newest = appointment.rescheduledTo[0]
    if (newest) {
      details.push(`Data anterior: ${formatDateTime(appointment.startsAt)}`)
      details.push(`Novo horário escolhido: ${formatDateTime(newest.startsAt)}`)
      details.push(`Solicitado em: ${formatDateTime(newest.createdAt)}`)
    } else {
      details.push(`Remarcação registrada em: ${formatDateTime(appointment.updatedAt)}`)
    }
  }

  if (appointment.status === 'CANCELADO') {
    const cancellation = parseCancellationMeta(appointment.notes)
    details.push(
      `Cancelado em: ${formatDateTime(cancellation?.canceledAt ?? appointment.updatedAt)}`,
    )

    if (cancellation?.reason) {
      details.push(`Motivo: ${cancellation.reason}`)
    }
  }

  if (appointment.status === 'FALTOU') {
    details.push('Sistema marcou ausência por falta de confirmação/presença no atendimento.')
    details.push(`Atualizado em: ${formatDateTime(appointment.updatedAt)}`)
  }

  return details
}

function buildCalendarMatrix(referenceDate: Date): Date[][] {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const firstGridDate = new Date(year, month, 1 - startOffset)

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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateRange(period: PeriodFilter, fromDate: string, toDate: string): { from?: Date; to?: Date } {
  const now = new Date()

  if (period === 'ALL') {
    return {}
  }

  if (period === 'TODAY') {
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (period === 'THIS_MONTH') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return { from, to }
  }

  if (period === 'FROM_DATE') {
    if (!fromDate) {
      return {}
    }
    const from = new Date(`${fromDate}T00:00:00`)
    return Number.isNaN(from.getTime()) ? {} : { from }
  }

  if (period === 'CUSTOM') {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : undefined
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : undefined

    return {
      from: from && !Number.isNaN(from.getTime()) ? from : undefined,
      to: to && !Number.isNaN(to.getTime()) ? to : undefined,
    }
  }

  return {}
}

function matchesShift(value: string, shift: ShiftFilter): boolean {
  if (shift === 'ALL') {
    return true
  }

  const hour = new Date(value).getHours()

  if (shift === 'MORNING') {
    return hour >= 6 && hour < 12
  }

  if (shift === 'AFTERNOON') {
    return hour >= 12 && hour < 18
  }

  return hour >= 18 || hour < 6
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

function toHourInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  return `${hours}:00`
}

const MANUAL_HOUR_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const hour = 8 + index
  return `${String(hour).padStart(2, '0')}:00`
})

function actionLabel(action: ManualAction): string {
  if (action === 'BOOK') {
    return 'marcar'
  }

  if (action === 'RESCHEDULE') {
    return 'remarcar'
  }

  return 'cancelar'
}

function formatBlockWindow(block: AvailabilityBlockItem): string {
  const startsAt = new Date(block.startsAt)
  const endsAt = new Date(block.endsAt)

  const day = startsAt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const startTime = startsAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const endTime = endsAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${day} • ${startTime} às ${endTime}`
}

export function AgendaPage() {
  const queryClient = useQueryClient()
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentListItem | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isAvailabilityConfigOpen, setIsAvailabilityConfigOpen] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('THIS_MONTH')
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('ALL')
  const [patientQuery, setPatientQuery] = useState('')
  const [manualAction, setManualAction] = useState<ManualAction>('BOOK')
  const [manualAppointmentId, setManualAppointmentId] = useState('')
  const [manualPatientName, setManualPatientName] = useState('')
  const [manualPatientPhone, setManualPatientPhone] = useState('')
  const [manualPatientEmail, setManualPatientEmail] = useState('')
  const [manualDate, setManualDate] = useState(toDateInputValue(new Date()))
  const [manualHour, setManualHour] = useState('08:00')
  const [manualReason, setManualReason] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualMessage, setManualMessage] = useState('')
  const [manualFeedback, setManualFeedback] = useState<string | null>(null)
  const [manualFeedbackIsWarning, setManualFeedbackIsWarning] = useState(false)
  const [calendarReferenceDate, setCalendarReferenceDate] = useState(() => {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null)

  const now = new Date()
  const [fromDate, setFromDate] = useState<string>(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [toDate, setToDate] = useState<string>(toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [availabilityFromDate, setAvailabilityFromDate] = useState<string>(
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  )
  const [availabilityToDate, setAvailabilityToDate] = useState<string>(
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  )
  const [availabilityStartTime, setAvailabilityStartTime] = useState('08:00')
  const [availabilityEndTime, setAvailabilityEndTime] = useState('18:00')
  const [availabilityReason, setAvailabilityReason] = useState('')
  const [availabilityWeekdays, setAvailabilityWeekdays] = useState<number[]>([])
  const [availabilityFeedback, setAvailabilityFeedback] = useState<string | null>(null)
  const [availabilityFeedbackIsWarning, setAvailabilityFeedbackIsWarning] = useState(false)
  const [statusFilters, setStatusFilters] = useState<Record<StatusFilter, boolean>>({
    AGENDADO: true,
    CONFIRMADO: true,
    CANCELADO: true,
    REMARCADO: true,
    FALTOU: true,
  })

  const appointmentsQuery = useQuery({
    queryKey: ['appointments'],
    queryFn: fetchAppointments,
  })

  const patientsQuery = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
  })

  const availabilityBlocksQuery = useQuery({
    queryKey: ['availability-blocks', availabilityFromDate, availabilityToDate],
    queryFn: () => fetchAvailabilityBlocks(availabilityFromDate, availabilityToDate),
    enabled: isAvailabilityConfigOpen,
  })

  const manualActionMutation = useMutation({
    mutationFn: executeManualAppointmentAction,
    onSuccess: async (result) => {
      setManualFeedback(result.message)
      setManualFeedbackIsWarning(Boolean(result.deliveryWarning))

      if (manualAction !== 'CANCEL') {
        setManualDate(toDateInputValue(new Date()))
        setManualHour('08:00')
      }

      if (manualAction === 'BOOK') {
        setManualNotes('')
        setManualMessage('')
      }

      if (manualAction === 'RESCHEDULE') {
        setManualNotes('')
        setManualMessage('')
      }

      if (manualAction === 'CANCEL') {
        setManualReason('')
        setManualMessage('')
      }

      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
      await queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
    onError: (error) => {
      setManualFeedback(error.message)
      setManualFeedbackIsWarning(true)
    },
  })

  const createAvailabilityBlocksMutation = useMutation({
    mutationFn: createAvailabilityBlocks,
    onSuccess: async (result) => {
      setAvailabilityFeedback(result.message)
      setAvailabilityFeedbackIsWarning(false)
      await queryClient.invalidateQueries({ queryKey: ['availability-blocks'] })
    },
    onError: (error) => {
      setAvailabilityFeedback(error.message)
      setAvailabilityFeedbackIsWarning(true)
    },
  })

  const deleteAvailabilityBlockMutation = useMutation({
    mutationFn: deleteAvailabilityBlock,
    onSuccess: async (result) => {
      setAvailabilityFeedback(result.message)
      setAvailabilityFeedbackIsWarning(false)
      await queryClient.invalidateQueries({ queryKey: ['availability-blocks'] })
    },
    onError: (error) => {
      setAvailabilityFeedback(error.message)
      setAvailabilityFeedbackIsWarning(true)
    },
  })

  const filteredAppointments = useMemo(() => {
    const appointments = appointmentsQuery.data ?? []
    const statusSet = new Set(
      (Object.entries(statusFilters) as Array<[StatusFilter, boolean]>).filter(([, enabled]) => enabled).map(([status]) => status),
    )

    const { from, to } = getDateRange(periodFilter, fromDate, toDate)
    const patientSearch = patientQuery.trim().toLowerCase()

    return appointments.filter((appointment) => {
      if (statusSet.size > 0 && !statusSet.has(appointment.status)) {
        return false
      }

      const startsAt = new Date(appointment.startsAt)

      if (from && startsAt < from) {
        return false
      }

      if (to && startsAt > to) {
        return false
      }

      if (!matchesShift(appointment.startsAt, shiftFilter)) {
        return false
      }

      if (patientSearch.length > 0) {
        const patientName = appointment.patient.name.toLowerCase()
        const phone = appointment.patient.phoneNumber.toLowerCase()

        if (!patientName.includes(patientSearch) && !phone.includes(patientSearch)) {
          return false
        }
      }

      return true
    })
  }, [appointmentsQuery.data, statusFilters, periodFilter, fromDate, toDate, shiftFilter, patientQuery])

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const appointment of filteredAppointments) {
      const key = toCalendarDayKey(new Date(appointment.startsAt))
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [filteredAppointments])

  const selectedCalendarAppointments = useMemo(() => {
    if (!selectedCalendarDate) {
      return []
    }

    const selectedKey = toCalendarDayKey(selectedCalendarDate)
    return filteredAppointments.filter((appointment) => toCalendarDayKey(new Date(appointment.startsAt)) === selectedKey)
  }, [filteredAppointments, selectedCalendarDate])

  const summary = useMemo(() => {
    const counts = {
      total: filteredAppointments.length,
      AGENDADO: 0,
      CONFIRMADO: 0,
      CANCELADO: 0,
      REMARCADO: 0,
      FALTOU: 0,
    }

    for (const appointment of filteredAppointments) {
      counts[appointment.status] += 1
    }

    return counts
  }, [filteredAppointments])

  const activeAppointments = useMemo(() => {
    const nowDate = Date.now()

    return (appointmentsQuery.data ?? []).filter((appointment) => {
      if (appointment.status !== 'AGENDADO' && appointment.status !== 'CONFIRMADO') {
        return false
      }

      return new Date(appointment.startsAt).getTime() >= nowDate
    })
  }, [appointmentsQuery.data])

  const calendarRows = useMemo(() => buildCalendarMatrix(calendarReferenceDate), [calendarReferenceDate])

  function handleManualAppointmentSelect(nextAppointmentId: string) {
    setManualAppointmentId(nextAppointmentId)

    const appointment = activeAppointments.find((item) => item.id === nextAppointmentId)

    if (!appointment) {
      return
    }

    setManualPatientName(appointment.patient.name)
    setManualPatientPhone(appointment.patient.phoneNumber)
    const startsAtDate = new Date(appointment.startsAt)
    setManualDate(toDateInputValue(startsAtDate))
    setManualHour(toHourInputValue(startsAtDate))
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedPhone = normalizePhone(manualPatientPhone)

    if (manualPatientName.trim().length < 2) {
      setManualFeedback('Informe o nome do paciente com ao menos 2 caracteres.')
      setManualFeedbackIsWarning(true)
      return
    }

    if (normalizedPhone.length < 10) {
      setManualFeedback('Informe um telefone válido com DDD para o paciente.')
      setManualFeedbackIsWarning(true)
      return
    }

    if ((manualAction === 'RESCHEDULE' || manualAction === 'CANCEL') && !manualAppointmentId) {
      setManualFeedback('Selecione a consulta que deseja alterar.')
      setManualFeedbackIsWarning(true)
      return
    }

    const payload: Parameters<typeof executeManualAppointmentAction>[0] = {
      action: manualAction,
      appointmentId: manualAction === 'BOOK' ? undefined : manualAppointmentId,
      patient: {
        name: manualPatientName.trim(),
        phoneNumber: normalizedPhone,
        email: manualPatientEmail.trim() || undefined,
      },
      reason: manualAction === 'CANCEL' ? manualReason.trim() || undefined : undefined,
      notes: manualAction === 'BOOK' || manualAction === 'RESCHEDULE' ? manualNotes.trim() || undefined : undefined,
      message: manualMessage.trim() || undefined,
    }

    if (manualAction === 'BOOK' || manualAction === 'RESCHEDULE') {
      const startsAt = new Date(`${manualDate}T${manualHour}:00`)

      if (Number.isNaN(startsAt.getTime())) {
        setManualFeedback('Informe data e horário válidos para a consulta.')
        setManualFeedbackIsWarning(true)
        return
      }

      const endsAt = new Date(startsAt.getTime() + 50 * 60 * 1000)
      payload.startsAt = startsAt.toISOString()
      payload.endsAt = endsAt.toISOString()
    }

    const confirmationText =
      manualAction === 'BOOK'
        ? `Confirmar marcação para ${manualPatientName.trim()}?`
        : manualAction === 'RESCHEDULE'
          ? `Confirmar remarcação da consulta selecionada para ${manualPatientName.trim()}?`
          : `Confirmar cancelamento da consulta selecionada de ${manualPatientName.trim()}?`

    if (!window.confirm(confirmationText)) {
      return
    }

    setManualFeedback(null)
    setManualFeedbackIsWarning(false)
    manualActionMutation.mutate(payload)
  }

  function handleCalendarDayClick(date: Date) {
    const selected = toDateOnly(date)
    setSelectedCalendarDate(selected)
    setCalendarReferenceDate(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }

  function handleCalendarMonthChange(monthOffset: number) {
    setCalendarReferenceDate((current) => new Date(current.getFullYear(), current.getMonth() + monthOffset, 1))
  }

  function handleSelectedCalendarDayChange(dayOffset: number) {
    setSelectedCalendarDate((current) => {
      if (!current) {
        return current
      }

      const next = new Date(current)
      next.setDate(next.getDate() + dayOffset)
      const normalized = toDateOnly(next)
      setCalendarReferenceDate(new Date(normalized.getFullYear(), normalized.getMonth(), 1))
      return normalized
    })
  }

  function handleAvailabilityWeekdayToggle(weekday: number) {
    setAvailabilityWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((item) => item !== weekday)
      }

      return [...current, weekday]
    })
  }

  function applyAvailabilityPreset(preset: 'DAY' | 'WEEK' | 'MONTH') {
    const today = new Date()

    if (preset === 'DAY') {
      const value = toDateInputValue(today)
      setAvailabilityFromDate(value)
      setAvailabilityToDate(value)
      return
    }

    if (preset === 'WEEK') {
      const weekStart = new Date(today)
      const dayIndex = (weekStart.getDay() + 6) % 7
      weekStart.setDate(weekStart.getDate() - dayIndex)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      setAvailabilityFromDate(toDateInputValue(weekStart))
      setAvailabilityToDate(toDateInputValue(weekEnd))
      return
    }

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    setAvailabilityFromDate(toDateInputValue(monthStart))
    setAvailabilityToDate(toDateInputValue(monthEnd))
  }

  function handleAvailabilitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!availabilityFromDate || !availabilityToDate) {
      setAvailabilityFeedback('Informe a data inicial e final do bloqueio.')
      setAvailabilityFeedbackIsWarning(true)
      return
    }

    if (availabilityStartTime >= availabilityEndTime) {
      setAvailabilityFeedback('O horário final deve ser maior que o horário inicial.')
      setAvailabilityFeedbackIsWarning(true)
      return
    }

    if (availabilityFromDate > availabilityToDate) {
      setAvailabilityFeedback('A data final deve ser igual ou posterior à data inicial.')
      setAvailabilityFeedbackIsWarning(true)
      return
    }

    setAvailabilityFeedback(null)
    setAvailabilityFeedbackIsWarning(false)

    createAvailabilityBlocksMutation.mutate({
      fromDate: availabilityFromDate,
      toDate: availabilityToDate,
      startTime: availabilityStartTime,
      endTime: availabilityEndTime,
      weekdays: availabilityWeekdays.length > 0 ? availabilityWeekdays : undefined,
      reason: availabilityReason.trim() || undefined,
    })
  }

  if (appointmentsQuery.isLoading) {
    return <LoadingState message="Carregando agenda..." />
  }

  if (appointmentsQuery.isError) {
    return (
      <ErrorState
        message={appointmentsQuery.error.message}
        onRetry={() => {
          void appointmentsQuery.refetch()
        }}
      />
    )
  }

  const appointments = filteredAppointments

  return (
    <section className="agenda-grid">
      <article className="card">
        <h3>Calendário simples</h3>
        <p className="muted-text">Visualização mensal com contagem conforme filtros aplicados.</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="secondary-button" onClick={() => setIsFilterOpen(true)}>
              Filtros e relatório
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setAvailabilityFeedback(null)
                setAvailabilityFeedbackIsWarning(false)
                setIsAvailabilityConfigOpen(true)
              }}
            >
              Configurar agenda
            </button>
          </div>
          <p className="muted-text">Total filtrado: {summary.total}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <button type="button" className="secondary-button" onClick={() => handleCalendarMonthChange(-1)}>
            ← Mês anterior
          </button>
          <strong style={{ textTransform: 'capitalize' }}>{formatMonthYear(calendarReferenceDate)}</strong>
          <button type="button" className="secondary-button" onClick={() => handleCalendarMonthChange(1)}>
            Próximo mês →
          </button>
        </div>

        <div className="calendar-grid">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
            <div key={label} className="calendar-head">
              {label}
            </div>
          ))}

          {calendarRows.flat().map((date) => {
            const key = toCalendarDayKey(date)
            const count = appointmentsByDay.get(key) ?? 0
            const isCurrentMonth =
              date.getMonth() === calendarReferenceDate.getMonth() &&
              date.getFullYear() === calendarReferenceDate.getFullYear()
            const isSelectedDay =
              selectedCalendarDate !== null && toCalendarDayKey(selectedCalendarDate) === key

            return (
              <div
                key={key}
                className={isCurrentMonth ? 'calendar-cell' : 'calendar-cell calendar-cell-muted'}
                role="button"
                tabIndex={0}
                onClick={() => handleCalendarDayClick(date)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleCalendarDayClick(date)
                  }
                }}
                style={{
                  cursor: 'pointer',
                  outline: isSelectedDay ? '2px solid #2563eb' : undefined,
                }}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <small>{count} consulta(s)</small>}
              </div>
            )
          })}
        </div>
      </article>

      <article className="card">
        <h3>Ações manuais na agenda</h3>
        <p className="muted-text">
          Use esta área para marcar, remarcar ou cancelar consultas manualmente. O sistema valida regras de agenda e
          envia aviso por WhatsApp ao paciente.
        </p>

        <form className="form-grid" onSubmit={handleManualSubmit}>
          <div>
            <label className="field-label" htmlFor="manual-action-type">
              Ação
            </label>
            <select
              id="manual-action-type"
              className="field-input"
              value={manualAction}
              onChange={(event) => {
                setManualAction(event.target.value as ManualAction)
                setManualFeedback(null)
              }}
            >
              <option value="BOOK">Marcar consulta</option>
              <option value="RESCHEDULE">Remarcar consulta</option>
              <option value="CANCEL">Cancelar consulta</option>
            </select>
          </div>

          {(manualAction === 'RESCHEDULE' || manualAction === 'CANCEL') && (
            <div>
              <label className="field-label" htmlFor="manual-appointment-select">
                Consulta atual
              </label>
              <select
                id="manual-appointment-select"
                className="field-input"
                value={manualAppointmentId}
                onChange={(event) => handleManualAppointmentSelect(event.target.value)}
              >
                <option value="">Selecione uma consulta ativa</option>
                {activeAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.patient.name} • {formatDateTime(appointment.startsAt)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-panel-grid">
            <div>
              <label className="field-label" htmlFor="manual-patient-name">
                Nome do paciente
              </label>
              <input
                id="manual-patient-name"
                className="field-input"
                value={manualPatientName}
                onChange={(event) => setManualPatientName(event.target.value)}
                list="manual-patient-name-options"
                placeholder="Nome completo"
              />
              <datalist id="manual-patient-name-options">
                {(patientsQuery.data ?? []).map((patient) => (
                  <option key={patient.id} value={patient.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="field-label" htmlFor="manual-patient-phone">
                Telefone do paciente
              </label>
              <input
                id="manual-patient-phone"
                className="field-input"
                value={manualPatientPhone}
                onChange={(event) => setManualPatientPhone(event.target.value)}
                list="manual-patient-phone-options"
                placeholder="(27) 99999-9999"
              />
              <datalist id="manual-patient-phone-options">
                {(patientsQuery.data ?? []).map((patient) => (
                  <option key={`${patient.id}-phone`} value={patient.phoneNumber} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="manual-patient-email">
              Email do paciente (opcional)
            </label>
            <input
              id="manual-patient-email"
              className="field-input"
              type="email"
              value={manualPatientEmail}
              onChange={(event) => setManualPatientEmail(event.target.value)}
              placeholder="paciente@email.com"
            />
          </div>

          {(manualAction === 'BOOK' || manualAction === 'RESCHEDULE') && (
            <div className="filter-panel-grid">
              <div>
                <label className="field-label" htmlFor="manual-date">
                  Dia da consulta
                </label>
                <input
                  id="manual-date"
                  type="date"
                  className="field-input"
                  value={manualDate}
                  onChange={(event) => setManualDate(event.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="manual-hour">
                  Hora de início
                </label>
                <select
                  id="manual-hour"
                  className="field-input"
                  value={manualHour}
                  onChange={(event) => setManualHour(event.target.value)}
                >
                  {MANUAL_HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(manualAction === 'BOOK' || manualAction === 'RESCHEDULE') && (
            <div>
              <label className="field-label" htmlFor="manual-notes">
                Observações internas (opcional)
              </label>
              <textarea
                id="manual-notes"
                className="field-textarea"
                rows={3}
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
              />
              <p className="muted-text">Estas observações ficam no sistema para uso do profissional.</p>
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="manual-message">
              Mensagem para WhatsApp (opcional)
            </label>
            <textarea
              id="manual-message"
              className="field-textarea"
              rows={3}
              value={manualMessage}
              onChange={(event) => setManualMessage(event.target.value)}
            />
            <p className="muted-text">Quando preenchido, este texto é enviado ao paciente no aviso da ação.</p>
          </div>

          {manualAction === 'CANCEL' && (
            <div>
              <label className="field-label" htmlFor="manual-reason">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                id="manual-reason"
                className="field-textarea"
                rows={3}
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
              />
              <p className="muted-text">Esse motivo também pode ser exibido no WhatsApp de cancelamento.</p>
            </div>
          )}

          <p className="muted-text">
            Regras aplicadas: apenas dias úteis, horários entre 08:00 e 18:00 e duração de 50 minutos por consulta.
          </p>

          {manualFeedback ? (
            <p className={manualFeedbackIsWarning ? 'error-text' : 'success-text'}>{manualFeedback}</p>
          ) : null}

          <button type="submit" className="primary-button" disabled={manualActionMutation.isPending}>
            {manualActionMutation.isPending
              ? 'Processando...'
              : `${actionLabel(manualAction).charAt(0).toUpperCase()}${actionLabel(manualAction).slice(1)} consulta`}
          </button>
        </form>
      </article>

      <article className="card">
        <h3>Lista de agendamentos</h3>
        {appointments.length === 0 ? (
          <EmptyState message="Nenhum agendamento cadastrado até o momento." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Data da consulta</th>
                  <th>Horário</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => {
                  return (
                    <tr key={appointment.id}>
                      <td>{appointment.patient.name}</td>
                      <td>{formatDate(appointment.startsAt)}</td>
                      <td>{formatTimeRange(appointment.startsAt, appointment.endsAt)}</td>
                      <td>{formatStatus(appointment.status)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setSelectedAppointment(appointment)}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {selectedCalendarDate && (
        <div className="modal-backdrop" onClick={() => setSelectedCalendarDate(null)}>
          <article className="card modal-card modal-card-large" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ textTransform: 'capitalize' }}>{formatLongDate(selectedCalendarDate)}</h3>
              <button type="button" className="secondary-button" onClick={() => setSelectedCalendarDate(null)}>
                Fechar
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleSelectedCalendarDayChange(-1)}
              >
                ← Dia anterior
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleSelectedCalendarDayChange(1)}
              >
                Próximo dia →
              </button>
            </div>

            {selectedCalendarAppointments.length === 0 ? (
              <EmptyState message="Não há consultas para este dia com os filtros atuais." />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>Horário</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCalendarAppointments.map((appointment) => (
                      <tr key={`calendar-day-${appointment.id}`}>
                        <td>{appointment.patient.name}</td>
                        <td>{formatTimeRange(appointment.startsAt, appointment.endsAt)}</td>
                        <td>{formatStatus(appointment.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      )}

      {selectedAppointment && (
        <div className="modal-backdrop" onClick={() => setSelectedAppointment(null)}>
          <article className="card modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Detalhes da consulta</h3>
            <p className="muted-text">
              {selectedAppointment.patient.name} • {formatStatus(selectedAppointment.status)}
            </p>

            {renderAppointmentDetails(selectedAppointment).length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {renderAppointmentDetails(selectedAppointment).map((item, index) => (
                  <li key={`${selectedAppointment.id}-modal-detail-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">Sem detalhes adicionais para este status.</p>
            )}

            <button type="button" className="secondary-button" onClick={() => setSelectedAppointment(null)}>
              Fechar
            </button>
          </article>
        </div>
      )}

      {isFilterOpen && (
        <div className="modal-backdrop" onClick={() => setIsFilterOpen(false)}>
          <article className="card modal-card modal-card-large" onClick={(event) => event.stopPropagation()}>
            <h3>Filtros avançados e relatório</h3>
            <p className="muted-text">Use os filtros abaixo para analisar o comportamento dos agendamentos.</p>

            <div className="filter-panel-grid">
              <div>
                <label className="field-label">Período</label>
                <select
                  className="field-input"
                  value={periodFilter}
                  onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
                >
                  <option value="ALL">Total (sem período)</option>
                  <option value="TODAY">Hoje</option>
                  <option value="THIS_MONTH">Mês atual</option>
                  <option value="FROM_DATE">A partir de uma data</option>
                  <option value="CUSTOM">Intervalo personalizado</option>
                </select>
              </div>

              <div>
                <label className="field-label">Turno</label>
                <select
                  className="field-input"
                  value={shiftFilter}
                  onChange={(event) => setShiftFilter(event.target.value as ShiftFilter)}
                >
                  <option value="ALL">Todos</option>
                  <option value="MORNING">Manhã</option>
                  <option value="AFTERNOON">Tarde</option>
                  <option value="EVENING">Noite/Madrugada</option>
                </select>
              </div>
            </div>

            <div className="filter-panel-grid">
              <div>
                <label className="field-label">Data inicial</label>
                <input
                  type="date"
                  className="field-input"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  disabled={periodFilter !== 'CUSTOM' && periodFilter !== 'FROM_DATE'}
                />
              </div>

              <div>
                <label className="field-label">Data final</label>
                <input
                  type="date"
                  className="field-input"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  disabled={periodFilter !== 'CUSTOM'}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Buscar paciente (nome ou telefone)</label>
              <input
                className="field-input"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Ex.: Maria ou 27999999999"
              />
            </div>

            <div>
              <p className="field-label">Status</p>
              <div className="status-chip-group">
                {(['AGENDADO', 'CONFIRMADO', 'REMARCADO', 'CANCELADO', 'FALTOU'] as StatusFilter[]).map((status) => (
                  <label key={status} className="status-chip">
                    <input
                      type="checkbox"
                      checked={statusFilters[status]}
                      onChange={(event) =>
                        setStatusFilters((current) => ({
                          ...current,
                          [status]: event.target.checked,
                        }))
                      }
                    />
                    {formatStatus(status)}
                  </label>
                ))}
              </div>
            </div>

            <div className="summary-grid">
              <div className="card metric-card">
                <span>Total</span>
                <strong>{summary.total}</strong>
              </div>
              <div className="card metric-card">
                <span>Agendados</span>
                <strong>{summary.AGENDADO}</strong>
              </div>
              <div className="card metric-card">
                <span>Confirmados</span>
                <strong>{summary.CONFIRMADO}</strong>
              </div>
              <div className="card metric-card">
                <span>Remarcados</span>
                <strong>{summary.REMARCADO}</strong>
              </div>
              <div className="card metric-card">
                <span>Cancelados</span>
                <strong>{summary.CANCELADO}</strong>
              </div>
              <div className="card metric-card">
                <span>Faltas</span>
                <strong>{summary.FALTOU}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPeriodFilter('THIS_MONTH')
                  setShiftFilter('ALL')
                  setPatientQuery('')
                  setStatusFilters({
                    AGENDADO: true,
                    CONFIRMADO: true,
                    CANCELADO: true,
                    REMARCADO: true,
                    FALTOU: true,
                  })
                  setFromDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
                  setToDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
                }}
              >
                Limpar filtros
              </button>
              <button type="button" className="primary-button" onClick={() => setIsFilterOpen(false)}>
                Aplicar e fechar
              </button>
            </div>
          </article>
        </div>
      )}

      {isAvailabilityConfigOpen && (
        <div className="modal-backdrop" onClick={() => setIsAvailabilityConfigOpen(false)}>
          <article className="card modal-card modal-card-large" onClick={(event) => event.stopPropagation()}>
            <h3>Configuração de disponibilidade da agenda</h3>
            <p className="muted-text">
              Cadastre períodos de indisponibilidade (férias, fechamento temporário ou pausas) para bloquear
              agendamentos e remarcações.
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="secondary-button" onClick={() => applyAvailabilityPreset('DAY')}>
                Dia
              </button>
              <button type="button" className="secondary-button" onClick={() => applyAvailabilityPreset('WEEK')}>
                Semana
              </button>
              <button type="button" className="secondary-button" onClick={() => applyAvailabilityPreset('MONTH')}>
                Mês
              </button>
            </div>

            <form className="form-grid" onSubmit={handleAvailabilitySubmit}>
              <div className="filter-panel-grid">
                <div>
                  <label className="field-label" htmlFor="availability-from-date">
                    Data inicial
                  </label>
                  <input
                    id="availability-from-date"
                    type="date"
                    className="field-input"
                    value={availabilityFromDate}
                    onChange={(event) => setAvailabilityFromDate(event.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="availability-to-date">
                    Data final
                  </label>
                  <input
                    id="availability-to-date"
                    type="date"
                    className="field-input"
                    value={availabilityToDate}
                    onChange={(event) => setAvailabilityToDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="filter-panel-grid">
                <div>
                  <label className="field-label" htmlFor="availability-start-time">
                    Início
                  </label>
                  <input
                    id="availability-start-time"
                    type="time"
                    className="field-input"
                    value={availabilityStartTime}
                    onChange={(event) => setAvailabilityStartTime(event.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="availability-end-time">
                    Fim
                  </label>
                  <input
                    id="availability-end-time"
                    type="time"
                    className="field-input"
                    value={availabilityEndTime}
                    onChange={(event) => setAvailabilityEndTime(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <p className="field-label">Dias da semana (opcional)</p>
                <div className="status-chip-group">
                  {WEEKDAY_OPTIONS.map((weekday) => (
                    <label key={`weekday-${weekday.value}`} className="status-chip">
                      <input
                        type="checkbox"
                        checked={availabilityWeekdays.includes(weekday.value)}
                        onChange={() => handleAvailabilityWeekdayToggle(weekday.value)}
                      />
                      {weekday.label}
                    </label>
                  ))}
                </div>
                <p className="muted-text">Se nenhum dia for marcado, o bloqueio será aplicado para todos os dias do período.</p>
              </div>

              <div>
                <label className="field-label" htmlFor="availability-reason">
                  Motivo opcional para exibir ao paciente
                </label>
                <textarea
                  id="availability-reason"
                  className="field-textarea"
                  rows={3}
                  value={availabilityReason}
                  onChange={(event) => setAvailabilityReason(event.target.value)}
                  placeholder="Ex.: Férias, congresso, ajuste interno da agenda..."
                />
              </div>

              {availabilityFeedback ? (
                <p className={availabilityFeedbackIsWarning ? 'error-text' : 'success-text'}>{availabilityFeedback}</p>
              ) : null}

              <button type="submit" className="primary-button" disabled={createAvailabilityBlocksMutation.isPending}>
                {createAvailabilityBlocksMutation.isPending ? 'Salvando bloqueios...' : 'Salvar bloqueio de agenda'}
              </button>
            </form>

            <h3>Bloqueios cadastrados no período</h3>
            {availabilityBlocksQuery.isLoading ? (
              <LoadingState message="Carregando bloqueios..." />
            ) : availabilityBlocksQuery.isError ? (
              <ErrorState
                message={availabilityBlocksQuery.error.message}
                onRetry={() => {
                  void availabilityBlocksQuery.refetch()
                }}
              />
            ) : (availabilityBlocksQuery.data ?? []).length === 0 ? (
              <EmptyState message="Nenhum bloqueio cadastrado para o período selecionado." />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Motivo</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(availabilityBlocksQuery.data ?? []).map((block) => (
                      <tr key={block.id}>
                        <td>{formatBlockWindow(block)}</td>
                        <td>{block.reason?.trim() ? block.reason : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={deleteAvailabilityBlockMutation.isPending}
                            onClick={() => {
                              if (!window.confirm('Deseja remover este bloqueio de agenda?')) {
                                return
                              }

                              deleteAvailabilityBlockMutation.mutate(block.id)
                            }}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button type="button" className="secondary-button" onClick={() => setIsAvailabilityConfigOpen(false)}>
              Fechar
            </button>
          </article>
        </div>
      )}
    </section>
  )
}
