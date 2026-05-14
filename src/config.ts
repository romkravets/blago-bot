import { z } from 'zod'

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SUPER_ADMIN_ID: z.coerce.bigint(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const config = schema.parse(process.env)
export const GROUP_LINK = 'https://t.me/+fXPZISsE5bQ4ZWVi'
