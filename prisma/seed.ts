import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const event = await prisma.event.upsert({
    where: { id: 'seed-event-id' },
    update: {},
    create: {
      id: 'seed-event-id',
      title: 'Перший розіграш',
      maxTickets: 500,
      status: 'ACTIVE',
    },
  })

  await prisma.config.upsert({
    where: { key: 'activeEventId' },
    update: { value: event.id },
    create: { key: 'activeEventId', value: event.id },
  })

  await prisma.config.upsert({
    where: { key: 'rememberUserData' },
    update: {},
    create: { key: 'rememberUserData', value: 'true' },
  })

  console.log('✅ Seed complete. Event ID:', event.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
