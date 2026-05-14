import crypto from 'crypto'
import { config } from '../../config'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { MyContext, MyConversation } from '../../types'
import {
  approveRejectKeyboard,
  cancelKeyboard,
  cancelWithBackKeyboard,
  confirmCancelKeyboard,
  phoneWithBackKeyboard,
} from '../keyboards'
import { checkIsAdmin, sendMainMenu } from '../menu'
import { logger } from '../middlewares/logger'

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
  screenshotFileId: string,
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
      await ctx.api.sendPhoto(Number(adminId), screenshotFileId, { caption: text, reply_markup: kb })
    } catch (err) {
      logger.error({ err, adminId }, 'Failed to notify admin')
    }
  }
}

// Shows confirm cancel dialog. Returns true if user confirmed cancel.
async function confirmCancel(conversation: MyConversation, ctx: MyContext): Promise<boolean> {
  await ctx.reply('Скасувати реєстрацію?', { reply_markup: confirmCancelKeyboard })
  while (true) {
    const update = await conversation.waitFor('callback_query')
    await update.answerCallbackQuery()
    if (update.callbackQuery.data === 'confirm_cancel') return true
    if (update.callbackQuery.data === 'continue_reg') return false
  }
}

type CollectedData = {
  firstName: string
  lastName: string
  phone: string
  screenshotFileId: string
  screenshotHash: string
}

// State machine for steps 1→2→3 with back navigation.
// startStep: which step to begin at (3 when user data is pre-filled).
// prefill: pre-filled values when starting at step 3.
// Returns null if user cancelled.
async function runRegistrationFlow(
  conversation: MyConversation,
  ctx: MyContext,
  startStep: 1 | 2 | 3,
  prefill: { firstName?: string; lastName?: string; phone?: string },
): Promise<CollectedData | null> {
  let step: 1 | 2 | 3 = startStep
  let firstName = prefill.firstName ?? ''
  let lastName = prefill.lastName ?? ''
  let phone = prefill.phone ?? ''

  while (true) {
    // ── Step 1: Name ───────────────────────────────────────────────
    if (step === 1) {
      await ctx.reply(
        "📋 Крок 1 з 3 — Ваше ім'я та прізвище\n\nВведіть повне ім'я (наприклад: Марія Іваненко)",
        { reply_markup: cancelKeyboard },
      )

      while (true) {
        const update = await conversation.wait()

        if (update.callbackQuery?.data === 'cancel') {
          await update.answerCallbackQuery()
          if (await confirmCancel(conversation, ctx)) return null
          await ctx.reply(
            "📋 Крок 1 з 3 — Ваше ім'я та прізвище\n\nВведіть повне ім'я (наприклад: Марія Іваненко)",
            { reply_markup: cancelKeyboard },
          )
          continue
        }

        const text = update.message?.text?.trim()
        if (!text) { await update.reply("Введіть ім'я та прізвище текстом."); continue }

        const parts = text.split(/\s+/)
        if (parts.length < 2) {
          await update.reply("Введіть ім'я та прізвище через пробіл (наприклад: Марія Іваненко)")
          continue
        }

        firstName = parts[0]
        lastName = parts.slice(1).join(' ')
        step = 2
        break
      }
    }

    // ── Step 2: Phone ──────────────────────────────────────────────
    else if (step === 2) {
      await ctx.reply(
        "📋 Крок 2 з 3 — Номер телефону\n\nНатисніть кнопку щоб поділитися номером\n\n💡 Це потрібно щоб ми могли зв'язатись з переможцем",
        { reply_markup: phoneWithBackKeyboard },
      )

      let wentBack = false
      while (true) {
        const update = await conversation.wait()
        const text = update.message?.text?.trim()

        if (text === '❌ Скасувати') {
          if (await confirmCancel(conversation, ctx)) return null
          await ctx.reply(
            '📋 Крок 2 з 3 — Номер телефону\n\nНатисніть кнопку щоб поділитися номером',
            { reply_markup: phoneWithBackKeyboard },
          )
          continue
        }

        if (text === '⬅️ Назад') {
          wentBack = true
          step = 1
          break
        }

        if (!update.message?.contact) {
          await update.reply('Натисніть кнопку 📱 нижче щоб поділитися номером.')
          continue
        }

        phone = update.message.contact.phone_number
        step = 3
        break
      }

      if (wentBack) continue
    }

    // ── Step 3: Screenshot ─────────────────────────────────────────
    else {
      await ctx.reply(
        '📋 Крок 3 з 3 — Скріншот оплати\n\nНадішліть скріншот підтвердження переказу.\n\n💡 Зробіть скріншот з банківського додатку де видно суму, дату і статус "Успішно"',
        { reply_markup: cancelWithBackKeyboard },
      )

      let wentBack = false
      while (true) {
        const update = await conversation.wait()

        if (update.callbackQuery?.data === 'back') {
          await update.answerCallbackQuery()
          wentBack = true
          step = 2
          break
        }

        if (update.callbackQuery?.data === 'cancel') {
          await update.answerCallbackQuery()
          if (await confirmCancel(conversation, ctx)) return null
          await ctx.reply(
            '📋 Крок 3 з 3 — Скріншот оплати\n\nНадішліть скріншот підтвердження переказу.',
            { reply_markup: cancelWithBackKeyboard },
          )
          continue
        }

        if (update.message?.document) { await update.reply('📸 Надішліть саме фото, а не файл.'); continue }

        const photo = update.message?.photo?.at(-1)
        if (!photo) { await update.reply('Надішліть фото скріншоту.'); continue }

        if (photo.file_size && photo.file_size < 10_000) {
          await update.reply('❌ Скріншот виглядає некоректно. Надішліть повний скріншот з банківського додатку.')
          continue
        }

        const screenshotFileId = photo.file_id
        const buffer = await conversation.external(() => downloadFileBuffer(ctx, screenshotFileId))
        const screenshotHash = crypto.createHash('sha256').update(buffer).digest('hex')

        const duplicate = await conversation.external(() =>
          prisma.donation.findFirst({ where: { screenshotHash } }),
        )
        if (duplicate) { await update.reply('❌ Цей скріншот вже було використано раніше.'); continue }

        return { firstName, lastName, phone, screenshotFileId, screenshotHash }
      }

      if (wentBack) continue
    }
  }
}

export async function registerConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  const telegramId = BigInt(ctx.from!.id)

  const remember = await conversation.external(() => getConfig('rememberUserData'))
  const existingUser = await conversation.external(() =>
    prisma.user.findUnique({ where: { telegramId } }),
  )

  let startStep: 1 | 2 | 3 = 1
  let prefill: { firstName?: string; lastName?: string; phone?: string } = {}

  if (remember === 'true' && existingUser) {
    await ctx.reply(
      `Ми вас знаємо! ${existingUser.firstName} ${existingUser.lastName}, ${existingUser.phone}\n\nВикористати ці дані?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Так', callback_data: 'use_saved' },
            { text: '✏️ Змінити', callback_data: 'change_data' },
          ]],
        },
      },
    )

    const choiceCtx = await conversation.waitFor('callback_query')
    await choiceCtx.answerCallbackQuery()

    if (choiceCtx.callbackQuery.data === 'use_saved') {
      startStep = 3
      prefill = {
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        phone: existingUser.phone,
      }
    }
  }

  const result = await runRegistrationFlow(conversation, ctx, startStep, prefill)

  if (!result) {
    const isAdminUser = await conversation.external(() => checkIsAdmin(telegramId))
    await sendMainMenu(ctx, isAdminUser)
    return
  }

  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('⚠️ Наразі немає активного розіграшу. Спробуйте пізніше.')
    return
  }

  const donation = await conversation.external(async () => {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        firstName: result.firstName,
        lastName: result.lastName,
        phone: result.phone,
        username: ctx.from?.username,
      },
      create: {
        telegramId,
        username: ctx.from?.username,
        firstName: result.firstName,
        lastName: result.lastName,
        phone: result.phone,
      },
    })

    const existing = await prisma.donation.findFirst({
      where: { eventId: activeEventId, userId: user.id, screenshotHash: result.screenshotHash },
    })
    if (existing) return { don: existing, user }

    const don = await prisma.donation.create({
      data: {
        eventId: activeEventId,
        userId: user.id,
        screenshotFileId: result.screenshotFileId,
        screenshotHash: result.screenshotHash,
        status: 'PENDING',
      },
    })
    return { don, user }
  })

  await ctx.reply(
    '✅ Дякуємо! Ваш запит отримано.\n\n⏳ Очікуйте підтвердження адміна.\nЗазвичай це займає до 2 годин.\n\nПеревірити статус — натисніть "📋 Мій номерок"',
  )

  await notifyAdmins(
    ctx,
    donation.don,
    { firstName: result.firstName, lastName: result.lastName, phone: result.phone },
    result.screenshotFileId,
  )

  const isAdminUser = await conversation.external(() => checkIsAdmin(telegramId))
  await sendMainMenu(ctx, isAdminUser)
}
