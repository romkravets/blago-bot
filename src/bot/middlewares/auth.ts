import { NextFunction } from 'grammy'
import { MyContext } from '../../types'
import { config } from '../../config'
import { prisma } from '../../db/client'

export const isSuperAdmin = (telegramId: bigint): boolean =>
  telegramId === config.SUPER_ADMIN_ID

export const isAdmin = async (telegramId: bigint): Promise<boolean> => {
  if (isSuperAdmin(telegramId)) return true
  const admin = await prisma.admin.findFirst({ where: { telegramId } })
  return !!admin
}

export const requireAdmin = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id ? BigInt(ctx.from.id) : null
  if (!userId || !(await isAdmin(userId))) {
    await ctx.reply('⛔ У вас немає прав для цієї команди.')
    return
  }
  return next()
}

export const requireSuperAdmin = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id ? BigInt(ctx.from.id) : null
  if (!userId || !isSuperAdmin(userId)) {
    await ctx.reply('⛔ Ця команда тільки для super admin.')
    return
  }
  return next()
}
