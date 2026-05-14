import { InlineKeyboard } from 'grammy'
import { prisma } from '../../db/client'
import { setConfig } from '../../db/configStore'
import { MyContext, MyConversation } from '../../types'
import { confirmRaffleKeyboard, raffleTicketCountKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export async function newRaffleConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  // ── Крок 1: Назва ──────────────────────────────────────────────────
  await ctx.reply(
    '🎯 Новий розіграш\n\n📋 Крок 1 з 2 — Введіть назву розіграшу\n\nНаприклад: Розіграш травень 2026',
    { reply_markup: new InlineKeyboard().text('❌ Скасувати', 'cancel_raffle') },
  )

  let title = ''
  while (true) {
    const update = await conversation.wait()

    if (update.callbackQuery?.data === 'cancel_raffle') {
      await update.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      return
    }

    const text = update.message?.text?.trim()
    if (!text) { await update.reply('Введіть назву текстом.'); continue }
    if (text.length < 3) { await update.reply('Назва занадто коротка. Мінімум 3 символи.'); continue }
    if (text.length > 100) { await update.reply('Назва занадто довга. Максимум 100 символів.'); continue }
    title = text
    break
  }

  // ── Крок 2: Кількість номерків ─────────────────────────────────────
  await ctx.reply(
    '📋 Крок 2 з 2 — Кількість номерків\n\nОберіть або введіть кількість:',
    { reply_markup: raffleTicketCountKeyboard },
  )

  let maxTickets = 0
  let waitingForCustom = false
  while (true) {
    const update = await conversation.wait()

    if (update.callbackQuery?.data === 'cancel_raffle') {
      await update.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      return
    }

    if (update.callbackQuery?.data?.startsWith('tickets:')) {
      await update.answerCallbackQuery()
      const val = update.callbackQuery.data.replace('tickets:', '')
      if (val === 'custom') {
        await ctx.reply('Введіть кількість номерків (від 10 до 10000):')
        waitingForCustom = true
        continue
      }
      maxTickets = parseInt(val)
      break
    }

    if (waitingForCustom && update.message?.text) {
      const num = parseInt(update.message.text.trim())
      if (isNaN(num) || num < 10 || num > 10000) {
        await update.reply('Введіть число від 10 до 10000.')
        continue
      }
      maxTickets = num
      break
    }
  }

  // ── Крок 3: Підтвердження ──────────────────────────────────────────
  await ctx.reply(
    `📋 Підтвердження нового розіграшу:\n\n🎟 Назва: ${title}\n🔢 Номерків: ${maxTickets}\n\nСтворити?`,
    { reply_markup: confirmRaffleKeyboard },
  )

  while (true) {
    const update = await conversation.waitFor('callback_query')
    await update.answerCallbackQuery()

    if (update.callbackQuery.data === 'cancel_raffle') {
      await ctx.reply('Скасовано.')
      return
    }

    if (update.callbackQuery.data === 'confirm_new_raffle') break
  }

  // ── Створення ─────────────────────────────────────────────────────
  const currentEventId = await conversation.external(() =>
    import('../../db/configStore').then((m) => m.getConfig('activeEventId')),
  )
  if (currentEventId) {
    await conversation.external(() =>
      prisma.event.update({ where: { id: currentEventId }, data: { status: 'CLOSED' } }),
    )
  }

  const newEvent = await conversation.external(() =>
    prisma.event.create({ data: { title, maxTickets, status: 'ACTIVE' } }),
  )
  await conversation.external(() => setConfig('activeEventId', newEvent.id))

  await ctx.reply(`✅ Новий розіграш розпочато!\n\n🎟 ${title}\nПул: ${maxTickets} номерків\nID: ${newEvent.id}`)
  logger.info({ eventId: newEvent.id, title, maxTickets }, 'New raffle created via wizard')
}
