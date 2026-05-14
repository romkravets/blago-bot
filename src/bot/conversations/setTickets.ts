import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { MyContext, MyConversation } from '../../types'
import { setTicketsQuickKeyboard } from '../keyboards'

export async function setTicketsConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('Немає активного розіграшу.')
    return
  }

  const event = await conversation.external(() =>
    prisma.event.findUnique({ where: { id: activeEventId } }),
  )
  if (!event) {
    await ctx.reply('Розіграш не знайдено.')
    return
  }

  const takenCount = await conversation.external(() =>
    prisma.donation.count({
      where: { eventId: activeEventId, chosenTicket: { not: null } },
    }),
  )

  await ctx.reply(
    `✏️ Змінити пул номерків\n\n` +
    `Поточний пул: ${event.maxTickets}\n` +
    `Видано номерків: ${takenCount}\n\n` +
    `⚠️ Мінімальне значення: ${takenCount + 1}\n\n` +
    `Оберіть нове значення:`,
    { reply_markup: setTicketsQuickKeyboard(takenCount) },
  )

  let newMax = 0
  let waitingForCustom = false
  while (true) {
    const update = await conversation.wait()

    if (update.callbackQuery?.data === 'cancel_set_tickets') {
      await update.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      return
    }

    if (update.callbackQuery?.data?.startsWith('set_tickets:')) {
      await update.answerCallbackQuery()
      const val = update.callbackQuery.data.replace('set_tickets:', '')
      if (val === 'custom') {
        await ctx.reply(`Введіть нову кількість (мінімум ${takenCount + 1}, максимум 10000):`)
        waitingForCustom = true
        continue
      }
      newMax = parseInt(val)
      break
    }

    if (waitingForCustom && update.message?.text) {
      const num = parseInt(update.message.text.trim())
      if (isNaN(num) || num <= takenCount || num > 10000) {
        await update.reply(`Введіть число від ${takenCount + 1} до 10000.`)
        continue
      }
      newMax = num
      break
    }
  }

  await conversation.external(() =>
    prisma.event.update({ where: { id: activeEventId }, data: { maxTickets: newMax } }),
  )

  await ctx.reply(`✅ Пул оновлено: ${newMax} номерків.`)
}
