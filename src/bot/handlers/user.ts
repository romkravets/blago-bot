import { Bot } from 'grammy'
import { MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { generateAvailableTickets, claimTicket, hasAvailableTickets } from '../../db/tickets'
import { ticketKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export function userHandlers(bot: Bot<MyContext>): void {
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.reply('😔 Наразі немає активного розіграшу.')
      return
    }

    const existing = await prisma.donation.findFirst({
      where: {
        eventId: activeEventId,
        user: { telegramId },
        status: { in: ['PENDING', 'APPROVED'] },
      },
    })

    if (existing) {
      await ctx.reply("Ви вже зареєстровані в цьому розіграші. Перевірте статус — /my_ticket")
      return
    }

    await ctx.reply(
      "🎁 Вітаємо в благодійному розіграші!\n\nДля участі вам потрібно:\n1. Вказати ім'я та прізвище\n2. Поділитися номером телефону\n3. Надіслати скріншот оплати",
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🎟 Зареєструватись', callback_data: 'start_register' }]],
        },
      }
    )
  })

  bot.callbackQuery('start_register', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('registerConversation')
  })

  bot.command('my_ticket', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const donation = await prisma.donation.findFirst({
      where: { eventId: activeEventId, user: { telegramId } },
      include: { user: true, event: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!donation) {
      await ctx.reply('Ви ще не зареєстровані. Натисніть /start щоб почати.')
      return
    }

    if (donation.status === 'PENDING' && !donation.chosenTicket) {
      await ctx.reply('⏳ Ваш запит на розгляді. Очікуйте підтвердження адміна.')
      return
    }

    if (donation.status === 'APPROVED' && !donation.chosenTicket) {
      const tickets = await generateAvailableTickets(activeEventId)
      if (tickets.length === 0) {
        await ctx.reply('😔 На жаль, всі номерки вже розібрані.')
        return
      }
      await ctx.reply('🎉 Ваш донат підтверджено!\n\n🎟 Оберіть свій номерок:', {
        reply_markup: ticketKeyboard(tickets, donation.id),
      })
      return
    }

    if (donation.status === 'APPROVED' && donation.chosenTicket) {
      await ctx.reply(
        `🎉 Ваш номерок: #${donation.chosenTicket}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.`
      )
      return
    }

    if (donation.status === 'REJECTED') {
      await ctx.reply('❌ Ваш запит було відхилено. Зверніться до організатора.')
      return
    }
  })

  bot.callbackQuery(/^ticket:(\d+):(.+)$/, async (ctx) => {
    const ticketNumber = parseInt(ctx.match[1])
    const donationId = ctx.match[2]
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.answerCallbackQuery('Помилка: немає активного розіграшу')
      return
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true },
    })

    if (!donation || donation.status !== 'APPROVED' || donation.chosenTicket) {
      await ctx.answerCallbackQuery('Цей запит вже оброблено')
      return
    }

    const claimed = await claimTicket(donationId, ticketNumber, activeEventId)

    if (!claimed) {
      const newTickets = await generateAvailableTickets(activeEventId)
      await ctx.answerCallbackQuery('Цей номерок вже зайнятий!')
      if (newTickets.length === 0) {
        await ctx.editMessageText('😔 На жаль, всі номерки вже розібрані.')
        return
      }
      await ctx.editMessageText('🎟 Оберіть інший номерок:', {
        reply_markup: ticketKeyboard(newTickets, donationId),
      })
      return
    }

    await ctx.answerCallbackQuery('Номерок обрано!')
    await ctx.editMessageText(
      `🎉 Вітаємо!\n\n🎟 Ваш номерок: #${ticketNumber}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.\nЗберегти дані — /my_ticket`
    )

    // Check if tickets are running low
    const stillAvailable = await hasAvailableTickets(activeEventId)
    if (!stillAvailable) {
      logger.warn({ eventId: activeEventId }, 'No more tickets available')
    }

    logger.info({ donationId, ticketNumber, userId: ctx.from.id }, 'Ticket claimed')
  })
}
