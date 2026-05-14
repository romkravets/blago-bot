# Bot UX Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent Reply Keyboards for users/admins, refactor registration with back/cancel-confirm, add help message and group link after ticket claim.

**Architecture:** New `src/bot/menu.ts` exports `sendMainMenu()` to avoid circular deps between handlers and conversations. All keyboard constants live in `keyboards.ts`. Registration becomes a single state-machine loop (steps 1→2→3 with back navigation).

**Tech Stack:** Grammy, TypeScript, Prisma/SQLite, Vitest, PM2

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/bot/keyboards.ts` | Modify | Add 5 new keyboard exports |
| `src/config.ts` | Modify | Add `GROUP_LINK` constant |
| `src/bot/menu.ts` | **Create** | `sendMainMenu(ctx, isAdmin)` helper |
| `src/bot/handlers/user.ts` | Modify | Revamp /start, add hears(), /help, group link |
| `src/bot/handlers/admin.ts` | Modify | Add hears() for all admin button texts |
| `src/bot/conversations/register.ts` | Modify | Full refactor: state machine, back, cancel confirm |

---

## Task 1: New keyboards

**Files:**
- Modify: `src/bot/keyboards.ts`

- [ ] **Step 1: Replace the full file content**

```typescript
import { InlineKeyboard, Keyboard } from 'grammy'

export const cancelKeyboard = new InlineKeyboard().text('❌ Скасувати', 'cancel')

export const phoneKeyboard = new Keyboard()
  .requestContact('📱 Поділитися номером')
  .resized()

export const approveRejectKeyboard = (donationId: string) =>
  new InlineKeyboard()
    .text('✅ Підтвердити', `approve:${donationId}`)
    .text('❌ Відхилити', `reject:${donationId}`)

export const ticketKeyboard = (tickets: number[], donationId: string) => {
  const kb = new InlineKeyboard()
  tickets.forEach((t) => kb.text(`#${t}`, `ticket:${t}:${donationId}`))
  return kb
}

export const exportKeyboard = new InlineKeyboard()
  .text('📊 CSV файл', 'export:csv').row()
  .text('📋 Список імен', 'export:names').row()
  .text('🔢 Список номерків', 'export:numbers')

// ── Persistent menus ─────────────────────────────────────────────────

export const userMenuKeyboard = new Keyboard()
  .text('🎟 Взяти участь').text('📋 Мій номерок').row()
  .text('ℹ️ Допомога')
  .resized()
  .persistent()

export const adminMenuKeyboard = new Keyboard()
  .text('⏳ Очікують').text('📊 Статистика').row()
  .text('👤 Додати донора').text('📤 Експорт').row()
  .text('⚙️ Налаштування')
  .resized()
  .persistent()

// ── Registration keyboards ────────────────────────────────────────────

// Step 2 (phone): requestContact + back/cancel as text buttons (oneTime removes after press)
export const phoneWithBackKeyboard = new Keyboard()
  .requestContact('📱 Поділитися номером').row()
  .text('⬅️ Назад').text('❌ Скасувати')
  .resized()
  .oneTime()

// Step 3 (screenshot) and step 1 (name) back+cancel inline
export const cancelWithBackKeyboard = new InlineKeyboard()
  .text('⬅️ Назад', 'back')
  .text('❌ Скасувати', 'cancel')

// Confirm cancel dialog
export const confirmCancelKeyboard = new InlineKeyboard()
  .text('✅ Так, скасувати', 'confirm_cancel')
  .text('▶️ Продовжити', 'continue_reg')
```

- [ ] **Step 2: Build to verify no TS errors**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm run build 2>&1 | head -20
```
Expected: clean build (0 errors)

- [ ] **Step 3: Commit**

```bash
git add src/bot/keyboards.ts
git commit -m "feat: add persistent menu and registration keyboards"
```

---

## Task 2: GROUP_LINK constant

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add GROUP_LINK export**

```typescript
import { z } from 'zod'

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SUPER_ADMIN_ID: z.coerce.bigint(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const config = schema.parse(process.env)
export const GROUP_LINK = 'https://t.me/+fXPZISsE5bQ4ZWVi'
```

- [ ] **Step 2: Run existing tests to make sure nothing broke**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm test 2>&1
```
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add GROUP_LINK constant"
```

---

## Task 3: Create menu.ts helper

**Files:**
- Create: `src/bot/menu.ts`

- [ ] **Step 1: Create the file**

```typescript
import { prisma } from '../db/client'
import { config } from '../config'
import { MyContext } from '../types'
import { adminMenuKeyboard, userMenuKeyboard } from './keyboards'

export async function checkIsAdmin(telegramId: bigint): Promise<boolean> {
  if (telegramId === config.SUPER_ADMIN_ID) return true
  const admin = await prisma.admin.findFirst({ where: { telegramId } })
  return !!admin
}

export async function sendMainMenu(ctx: MyContext, isAdmin: boolean): Promise<void> {
  const keyboard = isAdmin ? adminMenuKeyboard : userMenuKeyboard
  const text = isAdmin ? '👋 Панель адміністратора' : '🎁 Благодійний розіграш'
  await ctx.reply(text, { reply_markup: keyboard })
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm run build 2>&1 | head -20
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add src/bot/menu.ts
git commit -m "feat: add sendMainMenu and checkIsAdmin helpers"
```

---

## Task 4: Revamp user.ts — /start, hears(), /help, group link

**Files:**
- Modify: `src/bot/handlers/user.ts`

- [ ] **Step 1: Replace the full file**

```typescript
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

  // keep old callback for backwards compat during transition
  bot.callbackQuery('start_register', rateLimit, async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('registerConversation')
  })
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm run build 2>&1 | head -30
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add src/bot/handlers/user.ts
git commit -m "feat: persistent user menu, hears, help, group link after claim"
```

---

## Task 5: Admin hears() — replace full admin.ts

Extract each command's logic into a named handler function, then wire both `/command` and `hears()` to the same function. Eliminates duplication.

**Files:**
- Modify: `src/bot/handlers/admin.ts`

- [ ] **Step 1: Replace the full file**

```typescript
import { Bot, InputFile } from 'grammy'
import { prisma } from '../../db/client'
import { getConfig, setConfig } from '../../db/configStore'
import { generateAvailableTickets, hasAvailableTickets } from '../../db/tickets'
import { MyContext } from '../../types'
import { exportKeyboard, ticketKeyboard } from '../keyboards'
import { isSuperAdmin, requireAdmin, requireSuperAdmin } from '../middlewares/auth'
import { logger } from '../middlewares/logger'

export function adminHandlers(bot: Bot<MyContext>): void {

  // ── Approve callback ──────────────────────────────────────────────
  bot.callbackQuery(/^approve:(.+)$/, requireAdmin, async (ctx) => {
    const donationId = ctx.match[1]
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true, event: true },
    })

    if (!donation) { await ctx.answerCallbackQuery('Донат не знайдено'); return }
    if (donation.status !== 'PENDING') { await ctx.answerCallbackQuery('Вже оброблено'); return }

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

    await prisma.donation.update({ where: { id: donationId }, data: { status: 'APPROVED' } })
    await prisma.auditLog.create({
      data: {
        donationId,
        action: 'APPROVED',
        actor: `admin:${ctx.from.id}`,
        meta: JSON.stringify({ adminUsername: ctx.from.username }),
      },
    })

    await ctx.answerCallbackQuery('Підтверджено ✅')
    await ctx.editMessageCaption({ caption: `✅ Підтверджено адміном @${ctx.from.username ?? ctx.from.id}` })

    const tickets = await generateAvailableTickets(activeEventId)
    try {
      await ctx.api.sendMessage(
        Number(donation.user.telegramId),
        `🎉 Ваш донат підтверджено!\n\n🎟 Оберіть свій номерок:`,
        { reply_markup: ticketKeyboard(tickets, donationId) },
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
    if (!donation || donation.status !== 'PENDING') { await ctx.answerCallbackQuery('Вже оброблено'); return }
    ctx.session.pendingRejectionDonationId = donationId
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('rejectDonationConversation')
  })

  // ── /pending ──────────────────────────────────────────────────────
  async function handlePending(ctx: MyContext): Promise<void> {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) { await ctx.reply('Немає активного розіграшу.'); return }

    const donations = await prisma.donation.findMany({
      where: { eventId: activeEventId, status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    if (donations.length === 0) { await ctx.reply('✅ Немає запитів в очікуванні.'); return }

    const lines = donations.map(
      (d, i) => `${i + 1}. ${d.user.firstName} ${d.user.lastName} — ${d.user.phone}\n   ID: \`${d.id}\``,
    )
    await ctx.reply(`⏳ Очікують підтвердження (${donations.length}):\n\n${lines.join('\n\n')}`)
  }

  bot.command('pending', requireAdmin, handlePending)
  bot.hears('⏳ Очікують', requireAdmin, handlePending)

  // ── /stats ────────────────────────────────────────────────────────
  async function handleStats(ctx: MyContext): Promise<void> {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) { await ctx.reply('Немає активного розіграшу.'); return }

    const event = await prisma.event.findUnique({ where: { id: activeEventId } })
    const total = await prisma.donation.count({ where: { eventId: activeEventId } })
    const pending = await prisma.donation.count({ where: { eventId: activeEventId, status: 'PENDING' } })
    const approved = await prisma.donation.count({ where: { eventId: activeEventId, status: 'APPROVED' } })
    const rejected = await prisma.donation.count({ where: { eventId: activeEventId, status: 'REJECTED' } })
    const withTicket = await prisma.donation.count({ where: { eventId: activeEventId, chosenTicket: { not: null } } })

    await ctx.reply(
      `📊 Статистика розіграшу: ${event?.title}\n\n` +
      `🎟 Пул номерків: ${event?.maxTickets}\n` +
      `👥 Всього запитів: ${total}\n` +
      `⏳ Очікують: ${pending}\n` +
      `✅ Підтверджено: ${approved}\n` +
      `🎟 Номерки обрано: ${withTicket}\n` +
      `❌ Відхилено: ${rejected}`,
    )
  }

  bot.command('stats', requireAdmin, handleStats)
  bot.hears('📊 Статистика', requireAdmin, handleStats)

  // ── /export ───────────────────────────────────────────────────────
  async function handleExport(ctx: MyContext): Promise<void> {
    await ctx.reply('Оберіть формат експорту:', { reply_markup: exportKeyboard })
  }

  bot.command('export', requireAdmin, handleExport)
  bot.hears('📤 Експорт', requireAdmin, handleExport)

  bot.callbackQuery('export:csv', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const csv = ['number,firstName,lastName,phone']
    data.forEach((d) => csv.push(`${d.chosenTicket},${d.user.firstName},${d.user.lastName},${d.user.phone}`))
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
  async function handleAddDonor(ctx: MyContext): Promise<void> {
    await ctx.conversation.enter('addDonorConversation')
  }

  bot.command('add_donor', requireAdmin, handleAddDonor)
  bot.hears('👤 Додати донора', requireAdmin, handleAddDonor)

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
      create: { telegramId, role: 'ADMIN', addedBy: BigInt(ctx.from!.id) },
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
    if (isSuperAdmin(telegramId)) { await ctx.reply('⛔ Не можна видалити super admin.'); return }

    await prisma.admin.deleteMany({ where: { telegramId } })
    await ctx.reply(`✅ Адмін ${telegramIdStr} видалений.`)
  })

  // ── /new_raffle ───────────────────────────────────────────────────
  bot.command('new_raffle', requireSuperAdmin, async (ctx) => {
    const text = ctx.message?.text ?? ''
    const args = text.replace('/new_raffle', '').trim()
    const match = args.match(/^"?(.+?)"?\s+(\d+)$/)

    if (!match) {
      await ctx.reply('Використання: /new_raffle "Назва розіграшу" <кількість_номерків>\n\nПриклад: /new_raffle "Розіграш травень 2026" 500')
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
      await prisma.event.update({ where: { id: currentEventId }, data: { status: 'CLOSED' } })
    }

    const newEvent = await prisma.event.create({ data: { title, maxTickets, status: 'ACTIVE' } })
    await setConfig('activeEventId', newEvent.id)

    await ctx.reply(`✅ Новий розіграш розпочато!\n\n🎟 ${title}\nПул: ${maxTickets} номерків\nID: ${newEvent.id}`)
    logger.info({ eventId: newEvent.id, title, maxTickets }, 'New raffle created')
  })

  // ── /settings ─────────────────────────────────────────────────────
  async function handleSettings(ctx: MyContext): Promise<void> {
    const args = ctx.message?.text?.split(' ').slice(1)
    const rememberUsers = (await getConfig('rememberUserData')) ?? 'false'

    if (!args || args.length === 0) {
      await ctx.reply(
        `⚙️ Поточні налаштування:\n\n` +
        `• Запам'ятовувати юзерів: ${rememberUsers === 'true' ? 'увімк' : 'вимк'}\n\n` +
        `Команди:\n/settings remember_users on\n/settings remember_users off`,
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
  }

  bot.command('settings', requireSuperAdmin, handleSettings)
  bot.hears('⚙️ Налаштування', requireSuperAdmin, handleSettings)
}

async function getExportData() {
  const activeEventId = await getConfig('activeEventId')
  if (!activeEventId) return []

  return prisma.donation.findMany({
    where: { eventId: activeEventId, status: 'APPROVED', chosenTicket: { not: null } },
    include: { user: true },
    orderBy: { chosenTicket: 'asc' },
  })
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm run build 2>&1 | head -30
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add src/bot/handlers/admin.ts
git commit -m "feat: wire admin Reply Keyboard buttons, extract shared handler functions"
```

---

## Task 6: Refactor register.ts — state machine + back + cancel confirm

**Files:**
- Modify: `src/bot/conversations/register.ts`

- [ ] **Step 1: Replace the full file**

```typescript
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

// Shows cancel confirmation. Returns true if user confirmed cancel.
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
// startStep: which step to begin at (3 when user data is pre-filled from saved profile).
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

      if (wentBack) continue // re-enter outer loop at step 1
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

      if (wentBack) continue // re-enter outer loop at step 2
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
      update: { firstName: result.firstName, lastName: result.lastName, phone: result.phone, username: ctx.from?.username },
      create: { telegramId, username: ctx.from?.username, firstName: result.firstName, lastName: result.lastName, phone: result.phone },
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
```

- [ ] **Step 2: Build**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm run build 2>&1 | head -30
```
Expected: clean build (0 errors)

- [ ] **Step 3: Run tests**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && npm test 2>&1
```
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/bot/conversations/register.ts
git commit -m "feat: registration state machine with back navigation and cancel confirm"
```

---

## Task 7: Push and deploy to server

- [ ] **Step 1: Push to GitHub**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot && git push origin feat/initial-implementation
```

- [ ] **Step 2: Pull on server, build, restart**

```bash
ssh root@157.180.90.223 "cd /opt/blago-bot && git pull && npm install && npm run build && pm2 restart blago-bot"
```
Expected: `[PM2] Restarting 'blago-bot'`

- [ ] **Step 3: Check logs**

```bash
ssh root@157.180.90.223 "pm2 logs blago-bot --lines 10 --nostream"
```
Expected: `Bot started in polling mode`

- [ ] **Step 4: Manual smoke test checklist**
  - `/start` → shows 🎁 message + 3 keyboard buttons at bottom
  - `/start` as admin → shows 👋 message + 5 admin buttons at bottom
  - `🎟 Взяти участь` → enters registration, shows step 1
  - Step 1 → type name → step 2 with phone keyboard
  - Step 2 → `⬅️ Назад` → back to step 1
  - Step 2 → share phone → step 3 with screenshot prompt
  - Step 3 → `⬅️ Назад` → back to step 2
  - Any step → `❌ Скасувати` → confirm dialog → `✅ Так` → main menu restored
  - Any step → `❌ Скасувати` → confirm dialog → `▶️ Продовжити` → stays on current step
  - Complete registration → get "✅ Дякуємо!" + main menu keyboard restored
  - After admin approval + ticket chosen → get group link message
  - `ℹ️ Допомога` → full help text
  - `📋 Мій номерок` → correct status message
  - Admin `⏳ Очікують` → pending list
  - Admin `📊 Статистика` → stats message
