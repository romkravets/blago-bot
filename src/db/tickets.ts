import { prisma } from './client'

export async function generateAvailableTickets(eventId: string): Promise<number[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return []

  const taken = await prisma.donation.findMany({
    where: {
      eventId,
      status: { in: ['PENDING', 'APPROVED'] },
      chosenTicket: { not: null },
    },
    select: { chosenTicket: true },
  })
  const takenSet = new Set(taken.map((d) => d.chosenTicket as number))

  const available: number[] = []
  let attempts = 0
  const maxAttempts = event.maxTickets * 10

  while (available.length < 5 && attempts < maxAttempts) {
    const n = Math.floor(Math.random() * event.maxTickets) + 1
    if (!takenSet.has(n) && !available.includes(n)) {
      available.push(n)
    }
    attempts++
  }

  return available
}

// Returns true if claimed successfully, false if ticket already taken (race condition)
export async function claimTicket(
  donationId: string,
  ticketNumber: number,
  eventId: string
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.donation.findFirst({
        where: {
          eventId,
          chosenTicket: ticketNumber,
          status: { in: ['PENDING', 'APPROVED'] },
          NOT: { id: donationId },
        },
      })
      if (taken) throw new Error('TICKET_TAKEN')

      await tx.donation.update({
        where: { id: donationId },
        data: { chosenTicket: ticketNumber },
      })
    })
    return true
  } catch (err) {
    if (err instanceof Error && err.message === 'TICKET_TAKEN') return false
    throw err
  }
}

export async function hasAvailableTickets(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return false

  const takenCount = await prisma.donation.count({
    where: {
      eventId,
      status: { in: ['PENDING', 'APPROVED'] },
      chosenTicket: { not: null },
    },
  })
  return takenCount < event.maxTickets
}
