import { Bot, session } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import { config } from './config'
import { MyContext, SessionData } from './types'
import { loggerMiddleware } from './bot/middlewares/logger'
import { rateLimit } from './bot/middlewares/rateLimit'
import { errorHandler } from './bot/middlewares/errorHandler'
import { registerConversation } from './bot/conversations/register'
import { rejectDonationConversation } from './bot/conversations/rejectDonation'
import { addDonorConversation } from './bot/conversations/addDonor'
import { userHandlers } from './bot/handlers/user'
import { adminHandlers } from './bot/handlers/admin'
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

bot.use(createConversation(registerConversation))
bot.use(createConversation(rejectDonationConversation))
bot.use(createConversation(addDonorConversation))

userHandlers(bot)
adminHandlers(bot)

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
