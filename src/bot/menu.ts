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
