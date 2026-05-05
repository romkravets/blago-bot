import { Bot, session } from 'grammy'
import { conversations } from '@grammyjs/conversations'
import { config } from './config'
import { MyContext, SessionData } from './types'
import { loggerMiddleware } from './bot/middlewares/logger'
import { rateLimit } from './bot/middlewares/rateLimit'
import { errorHandler } from './bot/middlewares/errorHandler'
import { prisma } from './db/client'

const bot = new Bot<MyContext>(config.BOT_TOKEN)

bot.use(loggerMiddleware)
bot.use(rateLimit)
bot.use(
  session({
    initial: (): SessionData => ({}),
  })
)
bot.use(conversations())

// Conversations will be registered here after they are created
// bot.use(createConversation(registerConversation))
// bot.use(createConversation(rejectDonationConversation))
// bot.use(createConversation(addDonorConversation))

// Handlers will be wired here
// userHandlers(bot)
// adminHandlers(bot)

bot.catch(errorHandler)

process.once('SIGINT', async () => {
  bot.stop()
  await prisma.$disconnect()
})
process.once('SIGTERM', async () => {
  bot.stop()
  await prisma.$disconnect()
})

bot.start({
  onStart: () => console.log('Bot started in polling mode'),
})
