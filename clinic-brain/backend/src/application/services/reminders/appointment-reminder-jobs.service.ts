import { AppointmentStatus, InteractionType } from '@prisma/client'
import { prisma } from '../../../infra/database/prisma/client'
import { env } from '../../../infra/config/env'
import { sendEvolutionMessage } from '../evolution/send-evolution-message.service'

type ReminderKind = 'D1' | '2H'

type ReminderTarget = {
  appointmentId: string
  startsAt: Date
  professionalId: string
  professionalName: string
  professionalTimezone: string
  professionalInstanceName: string | null
  professionalApiKey: string | null
  patientId: string
  patientName: string
  patientPhoneNumber: string
  reminderD1Enabled: boolean
  reminder2hEnabled: boolean
  confirmationMessage: string | null
  settingsTimezone: string
}

let intervalHandle: NodeJS.Timeout | null = null
let running = false

function twoDigits(value: number): string {
  return value.toString().padStart(2, '0')
}

function localParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const values: Record<string, string> = {}

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    key: `${values.year}-${values.month}-${values.day}`,
  }
}

function addDaysLocalKey(reference: Date, timezone: string, days: number): string {
  const utcMidday = new Date(reference)
  utcMidday.setUTCHours(12, 0, 0, 0)
  utcMidday.setUTCDate(utcMidday.getUTCDate() + days)
  return localParts(utcMidday, timezone).key
}

function isD1Window(target: ReminderTarget, now: Date): boolean {
  if (!target.reminderD1Enabled) {
    return false
  }

  const timezone = target.settingsTimezone || target.professionalTimezone || env.DEFAULT_TIMEZONE
  const nowParts = localParts(now, timezone)

  if (nowParts.hour !== 8 || nowParts.minute !== 0) {
    return false
  }

  const startsAtKey = localParts(target.startsAt, timezone).key
  const tomorrowKey = addDaysLocalKey(now, timezone, 1)

  return startsAtKey === tomorrowKey
}

function is2hWindow(target: ReminderTarget, now: Date): boolean {
  if (!target.reminder2hEnabled) {
    return false
  }

  const startsAtMs = target.startsAt.getTime()
  const nowMs = now.getTime()
  const diffMs = startsAtMs - nowMs

  return diffMs >= 2 * 60 * 60 * 1000 && diffMs < 2 * 60 * 60 * 1000 + 60 * 1000
}

function buildReminderExternalId(kind: ReminderKind, appointmentId: string, startsAt: Date): string {
  if (kind === 'D1') {
    const dateKey = `${startsAt.getUTCFullYear()}${twoDigits(startsAt.getUTCMonth() + 1)}${twoDigits(
      startsAt.getUTCDate(),
    )}`

    return `reminder:d1:${appointmentId}:${dateKey}`
  }

  return `reminder:2h:${appointmentId}`
}

function buildReminderMessage(kind: ReminderKind, target: ReminderTarget): string {
  if (kind === 'D1') {
    const base =
      target.confirmationMessage ??
      `Olá ${target.patientName}, sua consulta com ${target.professionalName} é amanhã. Você confirma presença?`

    return `${base} Responda por aqui para registrar sua confirmação.`
  }

  return `Olá ${target.patientName}, lembrete final: sua consulta com ${target.professionalName} começa em aproximadamente 2 horas.`
}

async function wasReminderAlreadySent(professionalId: string, externalId: string): Promise<boolean> {
  const existing = await prisma.interaction.findFirst({
    where: {
      professionalId,
      externalMessageId: externalId,
    },
    select: {
      id: true,
    },
  })

  return Boolean(existing)
}

async function sendReminder(kind: ReminderKind, target: ReminderTarget): Promise<void> {
  const externalMessageId = buildReminderExternalId(kind, target.appointmentId, target.startsAt)
  const alreadySent = await wasReminderAlreadySent(target.professionalId, externalMessageId)

  if (alreadySent) {
    return
  }

  const message = buildReminderMessage(kind, target)

  await sendEvolutionMessage({
    phoneNumber: target.patientPhoneNumber,
    text: message,
    instanceName: target.professionalInstanceName ?? undefined,
    apiKey: target.professionalApiKey ?? undefined,
  })

  await prisma.interaction.create({
    data: {
      professionalId: target.professionalId,
      patientId: target.patientId,
      appointmentId: target.appointmentId,
      messageText: message,
      messageType: InteractionType.BOT,
      externalMessageId,
    },
  })
}

async function listReminderTargets(now: Date): Promise<ReminderTarget[]> {
  const maxWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  const appointments = await prisma.appointment.findMany({
    where: {
      status: {
        in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
      },
      startsAt: {
        gte: now,
        lte: maxWindow,
      },
    },
    select: {
      id: true,
      startsAt: true,
      professional: {
        select: {
          id: true,
          name: true,
          timezone: true,
          evolutionInstanceName: true,
          evolutionApiKey: true,
          settings: {
            select: {
              reminderD1Enabled: true,
              reminder2hEnabled: true,
              confirmationMessage: true,
              timezone: true,
            },
          },
        },
      },
      patient: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
        },
      },
    },
  })

  return appointments.map((appointment) => ({
    appointmentId: appointment.id,
    startsAt: appointment.startsAt,
    professionalId: appointment.professional.id,
    professionalName: appointment.professional.name,
    professionalTimezone: appointment.professional.timezone,
    professionalInstanceName: appointment.professional.evolutionInstanceName,
    professionalApiKey: appointment.professional.evolutionApiKey,
    patientId: appointment.patient.id,
    patientName: appointment.patient.name,
    patientPhoneNumber: appointment.patient.phoneNumber,
    reminderD1Enabled: appointment.professional.settings?.reminderD1Enabled ?? true,
    reminder2hEnabled: appointment.professional.settings?.reminder2hEnabled ?? true,
    confirmationMessage: appointment.professional.settings?.confirmationMessage ?? null,
    settingsTimezone: appointment.professional.settings?.timezone ?? appointment.professional.timezone,
  }))
}

export async function runAppointmentReminderCycle(referenceDate = new Date()): Promise<void> {
  const targets = await listReminderTargets(referenceDate)

  for (const target of targets) {
    if (isD1Window(target, referenceDate)) {
      await sendReminder('D1', target)
    }

    if (is2hWindow(target, referenceDate)) {
      await sendReminder('2H', target)
    }
  }
}

export function startAppointmentReminderScheduler() {
  if (!env.SCHEDULER_ENABLED || intervalHandle) {
    return
  }

  intervalHandle = setInterval(async () => {
    if (running) {
      return
    }

    running = true

    try {
      await runAppointmentReminderCycle(new Date())
    } catch (error) {
      console.error('Falha no ciclo de lembretes:', error)
    } finally {
      running = false
    }
  }, env.REMINDER_CHECK_INTERVAL_MS)

  void runAppointmentReminderCycle(new Date()).catch((error) => {
    console.error('Falha na execução inicial dos lembretes:', error)
  })
}

export function stopAppointmentReminderScheduler() {
  if (!intervalHandle) {
    return
  }

  clearInterval(intervalHandle)
  intervalHandle = null
}
