import { BotError } from 'grammy'
import { MyContext } from '../../types'
import { logger } from './logger'

const getUpdateType = (ctx: MyContext): string =>
  Object.keys(ctx.update).find((k) => k !== 'update_id') ?? 'unknown'

export const errorHandler = (err: BotError<MyContext>): void => {
  const ctx = err.ctx
  logger.error({
    err: err.error,
    updateType: getUpdateType(ctx),
    userId: ctx.from?.id,
  }, 'Bot error')

  ctx.reply('⚠️ Сталася помилка. Спробуйте ще раз або зверніться до адміна.').catch(() => {})
}
