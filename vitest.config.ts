import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'file:./prisma/blago.db',
      BOT_TOKEN: 'test_token',
      SUPER_ADMIN_ID: '123456789',
      NODE_ENV: 'test',
    },
  },
})
