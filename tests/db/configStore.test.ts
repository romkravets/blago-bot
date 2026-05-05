import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/db/client'
import { getConfig, setConfig } from '../../src/db/configStore'

beforeEach(async () => {
  await prisma.config.deleteMany()
})

describe('configStore', () => {
  it('returns null for missing key', async () => {
    const result = await getConfig('nonexistent')
    expect(result).toBeNull()
  })

  it('sets and gets a value', async () => {
    await setConfig('testKey', 'testValue')
    const result = await getConfig('testKey')
    expect(result).toBe('testValue')
  })

  it('overwrites existing value', async () => {
    await setConfig('key', 'first')
    await setConfig('key', 'second')
    expect(await getConfig('key')).toBe('second')
  })
})
