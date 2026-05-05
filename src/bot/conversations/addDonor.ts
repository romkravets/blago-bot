import { MyConversation, MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { generateAvailableTickets, hasAvailableTickets } from '../../db/tickets'
import { ticketKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export async function addDonorConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('Немає активного розіграшу.')
    return
  }

  // Name
  await ctx.reply("Введіть ім'я та прізвище учасника:")
  const nameCtx = await conversation.waitFor('message:text')
  const parts = nameCtx.message.text.trim().split(/\s+/)
  if (parts.length < 2) {
    await ctx.reply("⚠️ Потрібно ім'я та прізвище. Скасовано.")
    return
  }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')

  // Phone
  await ctx.reply('Введіть номер телефону учасника (наприклад: +380501234567):')
  const phoneCtx = await conversation.waitFor('message:text')
  const phone = phoneCtx.message.text.trim()

  // Telegram ID (optional)
  await ctx.reply('Введіть Telegram ID учасника (або 0 якщо невідомо):')
  const idCtx = await conversation.waitFor('message:text')
  const telegramIdRaw = parseInt(idCtx.message.text.trim())
  const telegramId =
    isNaN(telegramIdRaw) || telegramIdRaw === 0
      ? BigInt(Date.now())
      : BigInt(telegramIdRaw)

  const canAdd = await conversation.external(() => hasAvailableTickets(activeEventId))
  if (!canAdd) {
    await ctx.reply('😔 Немає вільних номерків.')
    return
  }

  const result = await conversation.external(async () => {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: { firstName, lastName, phone },
      create: { telegramId, firstName, lastName, phone },
    })

    const donation = await prisma.donation.create({
      data: {
        eventId: activeEventId,
        userId: user.id,
        status: 'APPROVED',
        external: true,
      },
    })

    return { user, donation }
  })

  const tickets = await conversation.external(() => generateAvailableTickets(activeEventId))
  await ctx.reply(
    `✅ Учасника додано: ${firstName} ${lastName}\n\nОберіть номерок для цього учасника:`,
    { reply_markup: ticketKeyboard(tickets, result.donation.id) }
  )

  logger.info({ donationId: result.donation.id, firstName, lastName }, 'External donor added')
}
