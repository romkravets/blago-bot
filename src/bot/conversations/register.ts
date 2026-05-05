import crypto from 'crypto'
import { MyConversation, MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { cancelKeyboard, phoneKeyboard, approveRejectKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'
import { config } from '../../config'

async function downloadFileBuffer(ctx: MyContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`
  const response = await fetch(url)
  return Buffer.from(await response.arrayBuffer())
}

async function notifyAdmins(
  ctx: MyContext,
  donation: { id: string },
  user: { firstName: string; lastName: string; phone: string },
  screenshotFileId: string
): Promise<void> {
  const admins = await prisma.admin.findMany()
  const text =
    `🔔 Новий запит\n\n` +
    `👤 ${user.firstName} ${user.lastName}\n` +
    `📞 ${user.phone}\n` +
    `📸 Скріншот нижче`

  const kb = approveRejectKeyboard(donation.id)
  const targets: bigint[] = [config.SUPER_ADMIN_ID, ...admins.map((a) => a.telegramId)]
  const uniqueTargets = [...new Set(targets)]

  for (const adminId of uniqueTargets) {
    try {
      await ctx.api.sendPhoto(Number(adminId), screenshotFileId, {
        caption: text,
        reply_markup: kb,
      })
    } catch (err) {
      logger.error({ err, adminId }, 'Failed to notify admin')
    }
  }
}

export async function registerConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const telegramId = BigInt(ctx.from!.id)

  const remember = await conversation.external(() => getConfig('rememberUserData'))
  const existingUser = await conversation.external(() =>
    prisma.user.findUnique({ where: { telegramId } })
  )

  let firstName: string
  let lastName: string
  let phone: string

  if (remember === 'true' && existingUser) {
    await ctx.reply(
      `Ми вас знаємо! ${existingUser.firstName} ${existingUser.lastName}, ${existingUser.phone}\n\nВикористати ці дані?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Так', callback_data: 'use_saved' },
              { text: '✏️ Змінити', callback_data: 'change_data' },
            ],
          ],
        },
      }
    )

    const choiceCtx = await conversation.waitFor('callback_query')
    await choiceCtx.answerCallbackQuery()

    if (choiceCtx.callbackQuery.data === 'use_saved') {
      firstName = existingUser.firstName
      lastName = existingUser.lastName
      phone = existingUser.phone
    } else {
      const collected = await collectUserData(conversation, ctx)
      firstName = collected.firstName
      lastName = collected.lastName
      phone = collected.phone
    }
  } else {
    const collected = await collectUserData(conversation, ctx)
    firstName = collected.firstName
    lastName = collected.lastName
    phone = collected.phone
  }

  // Step 3: Screenshot
  await ctx.reply(
    `📋 Крок 3 з 3 — Скріншот оплати\n\nНадішліть скріншот підтвердження переказу.\n\n💡 Зробіть скріншот з банківського додатку де видно суму, дату і статус "Успішно"`,
    { reply_markup: cancelKeyboard }
  )

  let screenshotFileId: string = ''
  let screenshotHash: string = ''

  while (true) {
    const photoCtx = await conversation.wait()

    if (photoCtx.callbackQuery?.data === 'cancel') {
      await photoCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      return
    }

    if (photoCtx.message?.document) {
      await photoCtx.reply('📸 Надішліть саме фото, а не файл.')
      continue
    }

    const photo = photoCtx.message?.photo?.at(-1)
    if (!photo) {
      await photoCtx.reply('Надішліть фото скріншоту.')
      continue
    }

    if (photo.file_size && photo.file_size < 50_000) {
      await photoCtx.reply('❌ Скріншот виглядає некоректно. Надішліть повний скріншот з банківського додатку.')
      continue
    }

    screenshotFileId = photo.file_id

    const buffer = await conversation.external(() => downloadFileBuffer(ctx, screenshotFileId))
    screenshotHash = crypto.createHash('sha256').update(buffer).digest('hex')

    const duplicate = await conversation.external(() =>
      prisma.donation.findFirst({ where: { screenshotHash } })
    )

    if (duplicate) {
      await photoCtx.reply('❌ Цей скріншот вже було використано раніше.')
      continue
    }

    break
  }

  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('⚠️ Наразі немає активного розіграшу. Спробуйте пізніше.')
    return
  }

  const donation = await conversation.external(async () => {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: { firstName, lastName, phone, username: ctx.from?.username },
      create: {
        telegramId,
        username: ctx.from?.username,
        firstName,
        lastName,
        phone,
      },
    })

    const don = await prisma.donation.create({
      data: {
        eventId: activeEventId,
        userId: user.id,
        screenshotFileId,
        screenshotHash,
        status: 'PENDING',
        telegramMessageId: BigInt(ctx.message?.message_id ?? 0),
      },
    })

    return { don, user }
  })

  await ctx.reply(
    '✅ Дякуємо! Ваш запит отримано.\n\n⏳ Очікуйте підтвердження адміна.\nЗазвичай це займає до 2 годин.\n\nПеревірити статус — /my_ticket'
  )

  await notifyAdmins(
    ctx,
    donation.don,
    { firstName, lastName, phone },
    screenshotFileId
  )
}

async function collectUserData(
  conversation: MyConversation,
  ctx: MyContext
): Promise<{ firstName: string; lastName: string; phone: string }> {
  // Name
  await ctx.reply(
    "📋 Крок 1 з 3 — Ваше ім'я та прізвище\n\nВведіть ваше повне ім'я (наприклад: Марія Іваненко)",
    { reply_markup: cancelKeyboard }
  )

  let firstName: string = ''
  let lastName: string = ''

  while (true) {
    const nameCtx = await conversation.wait()

    if (nameCtx.callbackQuery?.data === 'cancel') {
      await nameCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      throw new Error('CANCELLED')
    }

    const text = nameCtx.message?.text?.trim()
    if (!text) {
      await nameCtx.reply("Введіть ім'я та прізвище текстом.")
      continue
    }

    const parts = text.split(/\s+/)
    if (parts.length < 2) {
      await nameCtx.reply("Введіть ім'я та прізвище через пробіл (наприклад: Марія Іваненко)")
      continue
    }

    firstName = parts[0]
    lastName = parts.slice(1).join(' ')
    break
  }

  // Phone
  await ctx.reply(
    "📋 Крок 2 з 3 — Номер телефону\n\nНатисніть кнопку нижче щоб поділитися номером\n\n💡 Це потрібно щоб ми могли зв'язатись з переможцем",
    { reply_markup: phoneKeyboard }
  )

  let phone: string = ''

  while (true) {
    const phoneCtx = await conversation.wait()

    if (phoneCtx.callbackQuery?.data === 'cancel') {
      await phoneCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      throw new Error('CANCELLED')
    }

    if (!phoneCtx.message?.contact) {
      await phoneCtx.reply('Натисніть кнопку "Поділитися номером" нижче.')
      continue
    }

    phone = phoneCtx.message.contact.phone_number
    break
  }

  return { firstName, lastName, phone }
}
