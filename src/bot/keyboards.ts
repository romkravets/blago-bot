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
