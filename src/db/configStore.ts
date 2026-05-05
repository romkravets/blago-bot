import { prisma } from './client'

export async function getConfig(key: string): Promise<string | null> {
  const row = await prisma.config.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}
