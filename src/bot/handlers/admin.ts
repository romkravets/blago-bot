import { Bot, InputFile } from 'grammy'
import { MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig, setConfig } from '../../db/configStore'
import { generateAvailableTickets, hasAvailableTickets } from '../../db/tickets'
import { requireAdmin, requireSuperAdmin, isSuperAdmin } from '../middlewares/auth'
import { ticketKeyboard, exportKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export function adminHandlers(bot: Bot<MyContext>): void {
  // ── Approve callback ──────────────────────────────────────────────
  bot.callbackQuery(/^approve:(.+)$/, requireAdmin, async (ctx) => {
    const donationId = ctx.match[1]

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true, event: true },
    })

    if (!donation) {
      await ctx.answerCallbackQuery('Донат не знайдено')
      return
    }

    if (donation.status !== 'PENDING') {
      await ctx.answerCallbackQuery('Вже оброблено')
      return
    }

    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId || donation.eventId !== activeEventId) {
      await ctx.answerCallbackQuery('Помилка: активна подія не збігається')
      return
    }

    const noTickets = !(await hasAvailableTickets(activeEventId))
    if (noTickets) {
      await ctx.answerCallbackQuery('⚠️ Немає вільних номерків!')
      await ctx.editMessageCaption({ caption: '⚠️ Підтвердити неможливо — всі номерки розібрані' })
      return
    }

    await prisma.donation.update({
      where: { id: donationId },
      data: { status: 'APPROVED' },
    })

    await prisma.auditLog.create({
      data: {
        donationId,
        action: 'APPROVED',
        actor: `admin:${ctx.from.id}`,
        meta: JSON.stringify({ adminUsername: ctx.from.username }),
      },
    })

    await ctx.answerCallbackQuery('Підтверджено ✅')
    await ctx.editMessageCaption(
      { caption: `✅ Підтверджено адміном @${ctx.from.username ?? ctx.from.id}` }
    )

    const tickets = await generateAvailableTickets(activeEventId)
    try {
      await ctx.api.sendMessage(
        Number(donation.user.telegramId),
        `🎉 Ваш донат підтверджено!\n\n🎟 Оберіть свій номерок:`,
        { reply_markup: ticketKeyboard(tickets, donationId) }
      )
    } catch (err) {
      logger.error({ err, userId: donation.user.telegramId }, 'Failed to send ticket options to user')
    }

    logger.info({ donationId, adminId: ctx.from.id }, 'Donation approved')
  })

  // ── Reject callback ───────────────────────────────────────────────
  bot.callbackQuery(/^reject:(.+)$/, requireAdmin, async (ctx) => {
    const donationId = ctx.match[1]

    const donation = await prisma.donation.findUnique({ where: { id: donationId } })
    if (!donation || donation.status !== 'PENDING') {
      await ctx.answerCallbackQuery('Вже оброблено')
      return
    }

    ctx.session.pendingRejectionDonationId = donationId
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('rejectDonationConversation')
  })

  // ── /stats ────────────────────────────────────────────────────────
  bot.command('stats', requireAdmin, async (ctx) => {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const event = await prisma.event.findUnique({ where: { id: activeEventId } })
    const total = await prisma.donation.count({ where: { eventId: activeEventId } })
    const pending = await prisma.donation.count({ where: { eventId: activeEventId, status: 'PENDING' } })
    const approved = await prisma.donation.count({ where: { eventId: activeEventId, status: 'APPROVED' } })
    const rejected = await prisma.donation.count({ where: { eventId: activeEventId, status: 'REJECTED' } })
    const withTicket = await prisma.donation.count({
      where: { eventId: activeEventId, chosenTicket: { not: null } },
    })

    await ctx.reply(
      `📊 Статистика розіграшу: ${event?.title}\n\n` +
      `🎟 Пул номерків: ${event?.maxTickets}\n` +
      `👥 Всього запитів: ${total}\n` +
      `⏳ Очікують: ${pending}\n` +
      `✅ Підтверджено: ${approved}\n` +
      `🎟 Номерки обрано: ${withTicket}\n` +
      `❌ Відхилено: ${rejected}`
    )
  })

  // ── /pending ──────────────────────────────────────────────────────
  bot.command('pending', requireAdmin, async (ctx) => {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const donations = await prisma.donation.findMany({
      where: { eventId: activeEventId, status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    if (donations.length === 0) {
      await ctx.reply('✅ Немає запитів в очікуванні.')
      return
    }

    const lines = donations.map(
      (d, i) =>
        `${i + 1}. ${d.user.firstName} ${d.user.lastName} — ${d.user.phone}\n   ID: \`${d.id}\``
    )
    await ctx.reply(`⏳ Очікують підтвердження (${donations.length}):\n\n${lines.join('\n\n')}`)
  })

  // ── /export ───────────────────────────────────────────────────────
  bot.command('export', requireAdmin, async (ctx) => {
    await ctx.reply('Оберіть формат експорту:', { reply_markup: exportKeyboard })
  })

  bot.callbackQuery('export:csv', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const csv = ['number,firstName,lastName,phone']
    data.forEach((d) =>
      csv.push(`${d.chosenTicket},${d.user.firstName},${d.user.lastName},${d.user.phone}`)
    )
    const buf = Buffer.from(csv.join('\n'), 'utf-8')
    await ctx.replyWithDocument(new InputFile(buf, 'raffle-export.csv'))
  })

  bot.callbackQuery('export:names', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const text = data.map((d) => `${d.user.firstName} ${d.user.lastName}`).join('\n')
    await ctx.reply(`📋 Список імен:\n\n${text || 'Немає даних'}`)
  })

  bot.callbackQuery('export:numbers', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const text = data.map((d) => `#${d.chosenTicket}`).join('\n')
    await ctx.reply(`🔢 Список номерків:\n\n${text || 'Немає даних'}`)
  })

  // ── /add_donor ────────────────────────────────────────────────────
  bot.command('add_donor', requireAdmin, async (ctx) => {
    await ctx.conversation.enter('addDonorConversation')
  })

  // ── /add_admin ────────────────────────────────────────────────────
  bot.command('add_admin', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const telegramIdStr = args?.[0]

    if (!telegramIdStr || isNaN(Number(telegramIdStr))) {
      await ctx.reply('Використання: /add_admin <telegram_id>\n\nTelegram ID дізнатись через @userinfobot')
      return
    }

    const telegramId = BigInt(telegramIdStr)

    await prisma.admin.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        role: 'ADMIN',
        addedBy: BigInt(ctx.from!.id),
      },
    })

    await ctx.reply(`✅ Адмін ${telegramIdStr} доданий.`)
  })

  // ── /remove_admin ─────────────────────────────────────────────────
  bot.command('remove_admin', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const telegramIdStr = args?.[0]

    if (!telegramIdStr || isNaN(Number(telegramIdStr))) {
      await ctx.reply('Використання: /remove_admin <telegram_id>')
      return
    }

    const telegramId = BigInt(telegramIdStr)

    if (isSuperAdmin(telegramId)) {
      await ctx.reply('⛔ Не можна видалити super admin.')
      return
    }

    await prisma.admin.deleteMany({ where: { telegramId } })
    await ctx.reply(`✅ Адмін ${telegramIdStr} видалений.`)
  })

  // ── /new_raffle ───────────────────────────────────────────────────
  bot.command('new_raffle', requireSuperAdmin, async (ctx) => {
    const text = ctx.message?.text ?? ''
    const args = text.replace('/new_raffle', '').trim()

    const match = args.match(/^"?(.+?)"?\s+(\d+)$/)
    if (!match) {
      await ctx.reply(
        'Використання: /new_raffle "Назва розіграшу" <кількість_номерків>\n\nПриклад: /new_raffle "Розіграш травень 2026" 500'
      )
      return
    }

    const title = match[1].trim()
    const maxTickets = parseInt(match[2])

    if (maxTickets < 10 || maxTickets > 10000) {
      await ctx.reply('⚠️ Кількість номерків має бути від 10 до 10000.')
      return
    }

    const currentEventId = await getConfig('activeEventId')
    if (currentEventId) {
      await prisma.event.update({
        where: { id: currentEventId },
        data: { status: 'CLOSED' },
      })
    }

    const newEvent = await prisma.event.create({
      data: { title, maxTickets, status: 'ACTIVE' },
    })

    await setConfig('activeEventId', newEvent.id)

    await ctx.reply(
      `✅ Новий розіграш розпочато!\n\n🎟 ${title}\nПул: ${maxTickets} номерків\nID: ${newEvent.id}`
    )
    logger.info({ eventId: newEvent.id, title, maxTickets }, 'New raffle created')
  })

  // ── /settings ─────────────────────────────────────────────────────
  bot.command('settings', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const rememberUsers = (await getConfig('rememberUserData')) ?? 'false'

    if (!args || args.length === 0) {
      await ctx.reply(
        `⚙️ Поточні налаштування:\n\n` +
        `• Запам'ятовувати юзерів: ${rememberUsers === 'true' ? 'увімк' : 'вимк'}\n\n` +
        `Команди:\n/settings remember_users on\n/settings remember_users off`
      )
      return
    }

    if (args[0] === 'remember_users') {
      if (args[1] === 'on') {
        await setConfig('rememberUserData', 'true')
        await ctx.reply("✅ Юзери будуть запам'ятовуватись між розіграшами.")
      } else if (args[1] === 'off') {
        await setConfig('rememberUserData', 'false')
        await ctx.reply('✅ Юзери завжди вводять дані заново.')
      } else {
        await ctx.reply('Використання: /settings remember_users on|off')
      }
      return
    }

    await ctx.reply('Невідома команда. Спробуйте /settings без аргументів.')
  })
}

async function getExportData() {
  const activeEventId = await getConfig('activeEventId')
  if (!activeEventId) return []

  return prisma.donation.findMany({
    where: {
      eventId: activeEventId,
      status: 'APPROVED',
      chosenTicket: { not: null },
    },
    include: { user: true },
    orderBy: { chosenTicket: 'asc' },
  })
}
