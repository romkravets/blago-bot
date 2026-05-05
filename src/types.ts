import { Context, SessionFlavor } from 'grammy'
import { ConversationFlavor, Conversation } from '@grammyjs/conversations'

export type SessionData = {
  pendingRejectionDonationId?: string
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor
export type MyConversation = Conversation<MyContext>
