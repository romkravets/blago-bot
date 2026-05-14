import { Bot } from 'grammy'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import {
  claimTicket,
  generateAvailableTickets,
  hasAvailableTickets,
} from '../../db/tickets'
import { MyContext } from '../../types'
import { GROUP_LINK } from '../../config'
import { ticketKeyboard } from '../keyboards'
import { checkIsAdmin, sendMainMenu } from '../menu'
import { logger } from '../middlewares/logger'
import { rateLimit } from '../middlewares/rateLimit'

const HELP_TEXT = `ℹ️ Благодійний розіграш

Учасники роблять донат організатору, надсилають скріншот підтвердження і отримують номерок. Переможця обирає організатор вручну (wheelofnames.com).

📋 Як взяти участь:
1. Зроби переказ організатору
2. Натисни "🎟 Взяти участь"
3. Вкажи ім'я та прізвище
4. Поділися номером телефону
5. Надішли скріншот з банківського додатку
6. Очікуй підтвердження (до 2 годин)
7. Обери номерок із запропонованих

❓ Часті питання:
• Скріншот не приймається — переконайся що видно суму, дату та статус "Успішно"
• Вже брав участь раніше — твої дані збережені, реєстрація швидша
• Отримав відмову — зверніться до організатора

📞 Організатор: @KravetsNaastia`

export function userHandlers(bot: Bot<MyContext>): void {

  // ── /start ────────────────────────────────────────────────────────
  bot.command('start', rateLimit, async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)
    const adminUser = await checkIsAdmin(telegramId)
    await sendMainMenu(ctx, adminUser)
  })

  // ── 🎟 Взяти участь ───────────────────────────────────────────────
  bot.hears('🎟 Взяти участь', rateLimit, async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)

    if (await checkIsAdmin(telegramId)) {
      await ctx.reply('Адміни не реєструються як учасники.')
      return
    }

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
      await ctx.reply('Ви вже зареєстровані в цьому розіграші. Перевірте статус — натисніть "📋 Мій номерок".')
      return
    }

    await ctx.conversation.enter('registerConversation')
  })

  // ── 📋 Мій номерок + /my_ticket ──────────────────────────────────
  async function handleMyTicket(ctx: MyContext): Promise<void> {
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
      await ctx.reply('Ви ще не зареєстровані. Натисніть "🎟 Взяти участь".')
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
        `🎉 Ваш номерок: #${donation.chosenTicket}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.`,
      )
      return
    }

    if (donation.status === 'REJECTED') {
      await ctx.reply('❌ Ваш запит було відхилено. Зверніться до організатора @KravetsNaastia.')
      return
    }
  }

  bot.command('my_ticket', handleMyTicket)
  bot.hears('📋 Мій номерок', handleMyTicket)

  // ── ℹ️ Допомога + /help ───────────────────────────────────────────
  async function handleHelp(ctx: MyContext): Promise<void> {
    await ctx.reply(HELP_TEXT)
  }

  bot.command('help', handleHelp)
  bot.hears('ℹ️ Допомога', handleHelp)

  // ── Ticket claim callback ─────────────────────────────────────────
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
      `🎉 Вітаємо!\n\n🎟 Ваш номерок: #${ticketNumber}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.`,
    )

    await ctx.reply(`👥 Приєднуйся до групи учасників розіграшу:\n${GROUP_LINK}`)

    const stillAvailable = await hasAvailableTickets(activeEventId)
    if (!stillAvailable) {
      logger.warn({ eventId: activeEventId }, 'No more tickets available')
    }

    logger.info({ donationId, ticketNumber, userId: ctx.from.id }, 'Ticket claimed')
  })

  // keep old inline button for backwards compat
  bot.callbackQuery('start_register', rateLimit, async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('registerConversation')
  })
}
