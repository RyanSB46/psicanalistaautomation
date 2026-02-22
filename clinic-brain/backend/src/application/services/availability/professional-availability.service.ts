import { AppError } from '../../errors/app-error'
import { prisma } from '../../../infra/database/prisma/client'

type AvailabilityBlock = {
  startsAt: Date
  endsAt: Date
  reason: string | null
}

function formatDateTime(value: Date): string {
  return value.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function buildUnavailableMessage(block: AvailabilityBlock): string {
  const periodText = `${formatDateTime(block.startsAt)} até ${formatDateTime(block.endsAt)}`

  if (block.reason && block.reason.trim().length > 0) {
    return `Profissional indisponível no período ${periodText}. Motivo: ${block.reason.trim()}`
  }

  return `Profissional indisponível no período ${periodText}.`
}

export async function ensureProfessionalAvailability(input: {
  professionalId: string
  startsAt: Date
  endsAt: Date
  excludeBlockId?: string
}) {
  const conflictingBlock = await prisma.professionalAvailabilityBlock.findFirst({
    where: {
      id: input.excludeBlockId ? { not: input.excludeBlockId } : undefined,
      professionalId: input.professionalId,
      startsAt: {
        lt: input.endsAt,
      },
      endsAt: {
        gt: input.startsAt,
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    select: {
      startsAt: true,
      endsAt: true,
      reason: true,
    },
  })

  if (conflictingBlock) {
    throw new AppError(buildUnavailableMessage(conflictingBlock), 409)
  }
}
