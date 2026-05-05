import { NextFunction } from 'grammy'
import pino from 'pino'
import { MyContext } from '../../types'

export const logger = pino({
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

const getUpdateType = (ctx: MyContext): string =>
  Object.keys(ctx.update).find((k) => k !== 'update_id') ?? 'unknown'

export const loggerMiddleware = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  logger.info({
    updateType: getUpdateType(ctx),
    userId: ctx.from?.id,
    username: ctx.from?.username,
    ms,
  })
}
