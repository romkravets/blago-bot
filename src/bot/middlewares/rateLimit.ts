import { NextFunction } from 'grammy'
import { MyContext } from '../../types'

type RateEntry = { count: number; resetAt: number }

export const rateLimitMap = new Map<string, RateEntry>()

export const rateLimit = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id?.toString()
  if (!userId) return next()

  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return next()
  }

  entry.count++
  if (entry.count > 3) {
    await ctx.reply('⚠️ Забагато запитів. Спробуйте через 10 хвилин.')
    return
  }

  return next()
}
