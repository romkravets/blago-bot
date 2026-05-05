import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../src/db/client'
import {
  generateAvailableTickets,
  claimTicket,
  hasAvailableTickets,
} from '../../src/db/tickets'

// Helper: create a test user in the DB
async function createTestUser(suffix: string) {
  return prisma.user.create({
    data: {
      telegramId: BigInt(100000 + Math.floor(Math.random() * 900000)),
      firstName: 'Test',
      lastName: 'User',
      phone: `+380${suffix.padStart(9, '0')}`,
    },
  })
}

// Helper: create a test event
async function createTestEvent(maxTickets = 100) {
  return prisma.event.create({
    data: {
      title: 'Test Event',
      status: 'ACTIVE',
      maxTickets,
    },
  })
}

// Helper: create a donation (status defaults to PENDING)
async function createDonation(
  eventId: string,
  userId: string,
  chosenTicket: number | null = null,
  status = 'PENDING'
) {
  return prisma.donation.create({
    data: {
      eventId,
      userId,
      status,
      chosenTicket,
    },
  })
}

let createdEventIds: string[] = []
let createdUserIds: string[] = []

beforeEach(() => {
  createdEventIds = []
  createdUserIds = []
})

afterEach(async () => {
  // Clean up in order respecting FK constraints
  if (createdEventIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { donation: { eventId: { in: createdEventIds } } },
    })
    await prisma.donation.deleteMany({ where: { eventId: { in: createdEventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } })
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  }
})

describe('generateAvailableTickets', () => {
  it('returns 5 unique numbers in range 1..maxTickets', async () => {
    const event = await createTestEvent(100)
    createdEventIds.push(event.id)

    const tickets = await generateAvailableTickets(event.id)

    expect(tickets).toHaveLength(5)
    const unique = new Set(tickets)
    expect(unique.size).toBe(5)
    for (const t of tickets) {
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(100)
    }
  })

  it('does not return already-taken tickets', async () => {
    const event = await createTestEvent(10)
    createdEventIds.push(event.id)
    const user = await createTestUser('1')
    createdUserIds.push(user.id)

    // Mark tickets 1–9 as taken (PENDING with chosenTicket)
    for (let i = 1; i <= 9; i++) {
      await createDonation(event.id, user.id, i, 'PENDING')
    }

    // Only ticket 10 is free; the function should return at most 1 ticket
    const tickets = await generateAvailableTickets(event.id)
    expect(tickets.length).toBeGreaterThanOrEqual(1)
    expect(tickets.every((t) => t === 10)).toBe(true)
  })

  it('throws when event does not exist', async () => {
    await expect(generateAvailableTickets('non-existent-id')).rejects.toThrow('Event not found')
  })

  it('returns fewer than 5 when almost all tickets are taken', async () => {
    const event = await createTestEvent(3)
    createdEventIds.push(event.id)
    const user = await createTestUser('2')
    createdUserIds.push(user.id)

    // Take all 3 tickets
    for (let i = 1; i <= 3; i++) {
      await createDonation(event.id, user.id, i, 'APPROVED')
    }

    const tickets = await generateAvailableTickets(event.id)
    expect(tickets).toHaveLength(0)
  })
})

describe('claimTicket', () => {
  it('returns true and sets chosenTicket on success', async () => {
    const event = await createTestEvent(50)
    createdEventIds.push(event.id)
    const user = await createTestUser('3')
    createdUserIds.push(user.id)

    const donation = await createDonation(event.id, user.id, null)

    const result = await claimTicket(donation.id, 7, event.id)
    expect(result).toBe(true)

    const updated = await prisma.donation.findUnique({ where: { id: donation.id } })
    expect(updated?.chosenTicket).toBe(7)
  })

  it('returns false when ticket is already taken by another donation', async () => {
    const event = await createTestEvent(50)
    createdEventIds.push(event.id)
    const user = await createTestUser('4')
    createdUserIds.push(user.id)

    // First donation claims ticket 7
    const donation1 = await createDonation(event.id, user.id, 7, 'PENDING')
    // Second donation tries to claim the same ticket
    const donation2 = await createDonation(event.id, user.id, null, 'PENDING')

    const result = await claimTicket(donation2.id, 7, event.id)
    expect(result).toBe(false)

    // donation2 should still have no chosenTicket
    const unchanged = await prisma.donation.findUnique({ where: { id: donation2.id } })
    expect(unchanged?.chosenTicket).toBeNull()
  })

  it('allows claiming a ticket that is REJECTED (not considered taken)', async () => {
    const event = await createTestEvent(50)
    createdEventIds.push(event.id)
    const user = await createTestUser('5')
    createdUserIds.push(user.id)

    // A rejected donation had ticket 5 — should not block others
    await createDonation(event.id, user.id, 5, 'REJECTED')
    const donation2 = await createDonation(event.id, user.id, null, 'PENDING')

    const result = await claimTicket(donation2.id, 5, event.id)
    expect(result).toBe(true)
  })
})

describe('hasAvailableTickets', () => {
  it('returns true when tickets are available', async () => {
    const event = await createTestEvent(10)
    createdEventIds.push(event.id)

    const result = await hasAvailableTickets(event.id)
    expect(result).toBe(true)
  })

  it('returns false when all tickets are taken', async () => {
    const event = await createTestEvent(2)
    createdEventIds.push(event.id)
    const user = await createTestUser('6')
    createdUserIds.push(user.id)

    await createDonation(event.id, user.id, 1, 'APPROVED')
    await createDonation(event.id, user.id, 2, 'PENDING')

    const result = await hasAvailableTickets(event.id)
    expect(result).toBe(false)
  })

  it('returns false for non-existent event', async () => {
    const result = await hasAvailableTickets('does-not-exist')
    expect(result).toBe(false)
  })
})
