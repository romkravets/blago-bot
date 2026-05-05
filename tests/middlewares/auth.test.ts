import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

describe('isSuperAdmin', () => {
  it('returns true for super admin id', async () => {
    const { isSuperAdmin } = await import('../../src/bot/middlewares/auth')
    expect(isSuperAdmin(123456789n)).toBe(true) // vitest.config.ts sets SUPER_ADMIN_ID=123456789
  })

  it('returns false for other id', async () => {
    const { isSuperAdmin } = await import('../../src/bot/middlewares/auth')
    expect(isSuperAdmin(999999n)).toBe(false)
  })
})

describe('isAdmin', () => {
  it('returns true for super admin without DB record', async () => {
    const { isAdmin } = await import('../../src/bot/middlewares/auth')
    expect(await isAdmin(123456789n)).toBe(true)
  })

  it('returns false when no admin record found', async () => {
    const { isAdmin } = await import('../../src/bot/middlewares/auth')
    expect(await isAdmin(999999n)).toBe(false)
  })
})
