import { conversations, createConversation } from "@grammyjs/conversations";
import { Bot, session } from "grammy";
import { addDonorConversation } from "./bot/conversations/addDonor";
import { newRaffleConversation } from "./bot/conversations/newRaffle";
import { registerConversation } from "./bot/conversations/register";
import { rejectDonationConversation } from "./bot/conversations/rejectDonation";
import { setTicketsConversation } from "./bot/conversations/setTickets";
import { adminHandlers } from "./bot/handlers/admin";
import { userHandlers } from "./bot/handlers/user";
import { errorHandler } from "./bot/middlewares/errorHandler";
import { loggerMiddleware } from "./bot/middlewares/logger";
import { config } from "./config";
import { prisma } from "./db/client";
import { MyContext, SessionData } from "./types";

const bot = new Bot<MyContext>(config.BOT_TOKEN);

bot.use(loggerMiddleware);
bot.use(
  session({
    initial: (): SessionData => ({}),
  }),
);
bot.use(conversations());

bot.use(createConversation(registerConversation));
bot.use(createConversation(rejectDonationConversation));
bot.use(createConversation(addDonorConversation));
bot.use(createConversation(newRaffleConversation));
bot.use(createConversation(setTicketsConversation));

userHandlers(bot);
adminHandlers(bot);

bot.catch(errorHandler);

process.once("SIGINT", async () => {
  bot.stop();
  await prisma.$disconnect();
});
process.once("SIGTERM", async () => {
  bot.stop();
  await prisma.$disconnect();
});

bot.start({
  onStart: () => console.log("Bot started in polling mode"),
});
