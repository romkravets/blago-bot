import { InlineKeyboard, Keyboard } from 'grammy'

export const cancelKeyboard = new InlineKeyboard().text('❌ Скасувати', 'cancel')

export const phoneKeyboard = new Keyboard()
  .requestContact('📱 Поділитися номером')
  .resized()

export const approveRejectKeyboard = (donationId: string) =>
  new InlineKeyboard()
    .text('✅ Підтвердити', `approve:${donationId}`)
    .text('❌ Відхилити', `reject:${donationId}`).row()
    .text('🗑️ Видалити запит', `delete:${donationId}`)

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
  .text('🎯 Новий розіграш').text('✏️ Змінити пул').row()
  .text('⚙️ Налаштування')
  .resized()
  .persistent()

// ── Registration keyboards ────────────────────────────────────────────

export const phoneWithBackKeyboard = new Keyboard()
  .requestContact('📱 Поділитися номером').row()
  .text('⬅️ Назад').text('❌ Скасувати')
  .resized()
  .oneTime()

export const cancelWithBackKeyboard = new InlineKeyboard()
  .text('⬅️ Назад', 'back')
  .text('❌ Скасувати', 'cancel')

export const confirmCancelKeyboard = new InlineKeyboard()
  .text('✅ Так, скасувати', 'confirm_cancel')
  .text('▶️ Продовжити', 'continue_reg')

// ── New raffle wizard ─────────────────────────────────────────────────

export const raffleTicketCountKeyboard = new InlineKeyboard()
  .text('100', 'tickets:100').text('200', 'tickets:200').text('300', 'tickets:300').row()
  .text('500', 'tickets:500').text('1000', 'tickets:1000').row()
  .text('✏️ Своє число', 'tickets:custom').row()
  .text('❌ Скасувати', 'cancel_raffle')

export const confirmRaffleKeyboard = new InlineKeyboard()
  .text('✅ Створити', 'confirm_new_raffle')
  .text('❌ Скасувати', 'cancel_raffle')

// ── Set tickets wizard ────────────────────────────────────────────────

export const setTicketsQuickKeyboard = (takenCount: number) => {
  const options = [200, 300, 500, 1000].filter((n) => n > takenCount)
  const kb = new InlineKeyboard()
  options.forEach((n) => kb.text(String(n), `set_tickets:${n}`))
  if (options.length > 0) kb.row()
  kb.text('✏️ Своє число', 'set_tickets:custom').row()
  kb.text('❌ Скасувати', 'cancel_set_tickets')
  return kb
}
