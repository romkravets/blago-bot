import { describe, it, expect, vi } from 'vitest'

describe('config', () => {
  it('throws when BOT_TOKEN is missing', async () => {
    vi.stubEnv('BOT_TOKEN', '')
    vi.stubEnv('DATABASE_URL', 'file:./test.db')
    vi.stubEnv('SUPER_ADMIN_ID', '123456789')
    vi.resetModules()
    await expect(import('../src/config')).rejects.toThrow()
    vi.unstubAllEnvs()
  })

  it('parses SUPER_ADMIN_ID as BigInt', async () => {
    vi.stubEnv('BOT_TOKEN', 'test_token')
    vi.stubEnv('DATABASE_URL', 'file:./test.db')
    vi.stubEnv('SUPER_ADMIN_ID', '123456789')
    vi.resetModules()
    const { config } = await import('../src/config')
    expect(config.SUPER_ADMIN_ID).toBe(123456789n)
    vi.unstubAllEnvs()
  })
})
