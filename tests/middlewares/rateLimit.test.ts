import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows first 10 requests', async () => {
    const { rateLimitMap, rateLimit } = await import('../../src/bot/middlewares/rateLimit')
    rateLimitMap.clear()

    const next = vi.fn()
    const ctx = { from: { id: 111 }, reply: vi.fn() } as any

    for (let i = 0; i < 10; i++) await rateLimit(ctx, next)

    expect(next).toHaveBeenCalledTimes(10)
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('blocks 11th request', async () => {
    const { rateLimitMap, rateLimit } = await import('../../src/bot/middlewares/rateLimit')
    rateLimitMap.clear()

    const next = vi.fn()
    const ctx = { from: { id: 222 }, reply: vi.fn() } as any

    for (let i = 0; i < 11; i++) await rateLimit(ctx, next)

    expect(next).toHaveBeenCalledTimes(10)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Забагато запитів')
    )
  })
})
