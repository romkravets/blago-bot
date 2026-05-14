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

// Step 3 (screenshot) back+cancel inline
export const cancelWithBackKeyboard = new InlineKeyboard()
  .text('⬅️ Назад', 'back')
  .text('❌ Скасувати', 'cancel')

// Confirm cancel dialog
export const confirmCancelKeyboard = new InlineKeyboard()
  .text('✅ Так, скасувати', 'confirm_cancel')
  .text('▶️ Продовжити', 'continue_reg')
