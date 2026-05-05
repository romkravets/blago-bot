import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows first 3 requests', async () => {
    const { rateLimitMap, rateLimit } = await import('../../src/bot/middlewares/rateLimit')
    rateLimitMap.clear()

    const next = vi.fn()
    const ctx = { from: { id: 111 }, reply: vi.fn() } as any

    await rateLimit(ctx, next)
    await rateLimit(ctx, next)
    await rateLimit(ctx, next)

    expect(next).toHaveBeenCalledTimes(3)
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('blocks 4th request', async () => {
    const { rateLimitMap, rateLimit } = await import('../../src/bot/middlewares/rateLimit')
    rateLimitMap.clear()

    const next = vi.fn()
    const ctx = { from: { id: 222 }, reply: vi.fn() } as any

    await rateLimit(ctx, next)
    await rateLimit(ctx, next)
    await rateLimit(ctx, next)
    await rateLimit(ctx, next)

    expect(next).toHaveBeenCalledTimes(3)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Забагато запитів')
    )
  })
})
