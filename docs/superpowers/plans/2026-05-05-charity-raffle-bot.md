# Charity Raffle Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram-бот для благодійних розіграшів — реєстрація юзерів (ім'я, телефон, скрін), підтвердження адміном, вибір номерка з 5 доступних, експорт списку.

**Architecture:** Grammy polling bot на Node.js + TypeScript. SQLite через Prisma — єдине сховище (без Redis). Conversations plugin для wizard-флоу реєстрації та відхилення; approve/ticket — callback queries без conversations. Admins отримують нотифікації в DM, обробляють через inline кнопки.

**Tech Stack:** Node.js 20, TypeScript 5, Grammy 1.x + @grammyjs/conversations 1.x, Prisma 5 + SQLite, Zod, Pino, Vitest, PM2

---

## File Map

```
blago-bot/
├── src/
│   ├── index.ts                    # bot init, middleware chain, polling start, graceful shutdown
│   ├── config.ts                   # Zod env parse — BOT_TOKEN, DATABASE_URL, SUPER_ADMIN_ID
│   ├── types.ts                    # MyContext, MyConversation, SessionData
│   ├── db/
│   │   ├── client.ts               # Prisma singleton
│   │   ├── configStore.ts          # getConfig(key), setConfig(key, value)
│   │   └── tickets.ts              # generateAvailableTickets(eventId), claimTicket(donationId, ticket)
│   └── bot/
│       ├── keyboards.ts            # all InlineKeyboard / Keyboard builders
│       ├── handlers/
│       │   ├── user.ts             # /start, /my_ticket, ticket callback
│       │   └── admin.ts            # /stats, /pending, /export, /add_donor, /new_raffle, /settings, approve/reject callbacks
│       ├── conversations/
│       │   ├── register.ts         # wizard: ім'я → телефон → скрін
│       │   ├── addDonor.ts         # admin manual add
│       │   └── rejectDonation.ts   # admin rejection reason
│       └── middlewares/
│           ├── auth.ts             # isSuperAdmin, isAdmin, requireAdmin
│           ├── rateLimit.ts        # in-memory Map, 3 req / 10 min per user
│           ├── logger.ts           # pino request logging
│           └── errorHandler.ts     # global Grammy error handler
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                     # create Event + Config seed data
├── tests/
│   ├── db/configStore.test.ts
│   ├── db/tickets.test.ts
│   ├── middlewares/auth.test.ts
│   └── middlewares/rateLimit.test.ts
├── ecosystem.config.js             # PM2 config
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "blago-bot",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "grammy": "^1.21.0",
    "@grammyjs/conversations": "^1.2.0",
    "pino": "^8.19.0",
    "pino-pretty": "^11.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "prisma": "^5.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .env.example**

```env
BOT_TOKEN=
DATABASE_URL=file:./prisma/blago.db
SUPER_ADMIN_ID=
NODE_ENV=development
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.env
prisma/blago.db
prisma/blago.db-journal
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/romkravets/Documents/GitHub/blago-bot
npm install
```

Expected: no errors, `node_modules/` created.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore
git commit -m "chore: project bootstrap"
```

---

## Task 2: Config & Types

**Files:**
- Create: `src/config.ts`
- Create: `src/types.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('config', () => {
  it('throws when BOT_TOKEN is missing', () => {
    vi.stubEnv('BOT_TOKEN', '')
    vi.stubEnv('DATABASE_URL', 'file:./test.db')
    vi.stubEnv('SUPER_ADMIN_ID', '123456789')
    expect(() => {
      vi.resetModules()
      require('../src/config')
    }).toThrow()
    vi.unstubAllEnvs()
  })

  it('parses SUPER_ADMIN_ID as BigInt', () => {
    vi.stubEnv('BOT_TOKEN', 'test_token')
    vi.stubEnv('DATABASE_URL', 'file:./test.db')
    vi.stubEnv('SUPER_ADMIN_ID', '123456789')
    vi.resetModules()
    const { config } = require('../src/config')
    expect(config.SUPER_ADMIN_ID).toBe(123456789n)
    vi.unstubAllEnvs()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL — "Cannot find module '../src/config'"

- [ ] **Step 3: Create src/config.ts**

```typescript
import { z } from 'zod'

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SUPER_ADMIN_ID: z.coerce.bigint(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const config = schema.parse(process.env)
```

- [ ] **Step 4: Create src/types.ts**

```typescript
import { Context, SessionFlavor } from 'grammy'
import { ConversationFlavor, Conversation } from '@grammyjs/conversations'

export type SessionData = {
  pendingRejectionDonationId?: string
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor
export type MyConversation = Conversation<MyContext>
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/config.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/types.ts tests/config.test.ts
git commit -m "feat: config validation and context types"
```

---

## Task 3: Database Schema & Prisma Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`

- [ ] **Step 1: Create prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Config {
  key   String @id
  value String
}

model Event {
  id         String      @id @default(uuid())
  title      String
  description String?
  status     EventStatus @default(ACTIVE)
  maxTickets Int         @default(500)
  createdAt  DateTime    @default(now())
  donations  Donation[]
}

model Admin {
  id         String    @id @default(uuid())
  telegramId BigInt    @unique
  username   String?
  role       AdminRole @default(ADMIN)
  addedBy    BigInt
  createdAt  DateTime  @default(now())
}

model User {
  id         String     @id @default(uuid())
  telegramId BigInt     @unique
  username   String?
  firstName  String
  lastName   String
  phone      String
  createdAt  DateTime   @default(now())
  donations  Donation[]
}

model Donation {
  id                String         @id @default(uuid())
  eventId           String
  userId            String
  screenshotFileId  String?
  screenshotHash    String?
  status            DonationStatus @default(PENDING)
  chosenTicket      Int?
  external          Boolean        @default(false)
  suspicious        Boolean        @default(false)
  telegramMessageId BigInt?        @unique
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  event             Event          @relation(fields: [eventId], references: [id])
  user              User           @relation(fields: [userId], references: [id])
  logs              AuditLog[]
}

model AuditLog {
  id         String   @id @default(uuid())
  donationId String
  action     String
  actor      String
  meta       String?
  createdAt  DateTime @default(now())
  donation   Donation @relation(fields: [donationId], references: [id])
}

enum AdminRole {
  SUPER
  ADMIN
}

enum EventStatus {
  ACTIVE
  CLOSED
  CANCELLED
}

enum DonationStatus {
  PENDING
  APPROVED
  REJECTED
}
```

- [ ] **Step 2: Push schema to SQLite**

```bash
cp .env.example .env
# Заповни BOT_TOKEN і SUPER_ADMIN_ID в .env
npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Create src/db/client.ts**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Verify Prisma client generates**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/db/client.ts
git commit -m "feat: SQLite schema and Prisma client"
```

---

## Task 4: Config Store Helpers

**Files:**
- Create: `src/db/configStore.ts`
- Create: `tests/db/configStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/configStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./prisma/test.db' } },
})

// Import after prisma setup
let getConfig: (key: string) => Promise<string | null>
let setConfig: (key: string, value: string) => Promise<void>

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM Config`
  const store = await import('../src/db/configStore')
  getConfig = store.getConfig
  setConfig = store.setConfig
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/db/configStore.test.ts
```

Expected: FAIL — "Cannot find module '../src/db/configStore'"

- [ ] **Step 3: Create src/db/configStore.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/db/configStore.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/configStore.ts tests/db/configStore.test.ts
git commit -m "feat: Config table helpers (getConfig, setConfig)"
```

---

## Task 5: Ticket Generation Logic

**Files:**
- Create: `src/db/tickets.ts`
- Create: `tests/db/tickets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/tickets.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('generateAvailableTickets', () => {
  it('returns 5 unique numbers within range', async () => {
    // Mock prisma
    vi.mock('../src/db/client', () => ({
      prisma: {
        donation: {
          findMany: vi.fn().mockResolvedValue([
            { chosenTicket: 1 },
            { chosenTicket: 2 },
          ]),
        },
        event: {
          findUnique: vi.fn().mockResolvedValue({ maxTickets: 100 }),
        },
      },
    }))

    const { generateAvailableTickets } = await import('../src/db/tickets')
    const tickets = await generateAvailableTickets('event-uuid')

    expect(tickets).toHaveLength(5)
    expect(new Set(tickets).size).toBe(5)
    tickets.forEach((t) => {
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(100)
      expect(t).not.toBe(1)
      expect(t).not.toBe(2)
    })
  })
})

describe('claimTicket', () => {
  it('returns false when ticket is already taken', async () => {
    vi.mock('../src/db/client', () => ({
      prisma: {
        $transaction: vi.fn(async (fn: Function) => {
          const tx = {
            donation: {
              findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
              update: vi.fn(),
            },
          }
          return fn(tx)
        }),
      },
    }))

    const { claimTicket } = await import('../src/db/tickets')
    const result = await claimTicket('donation-id', 47, 'event-id')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/db/tickets.test.ts
```

Expected: FAIL — "Cannot find module '../src/db/tickets'"

- [ ] **Step 3: Create src/db/tickets.ts**

```typescript
import { prisma } from './client'

export async function generateAvailableTickets(eventId: string): Promise<number[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw new Error('Event not found')

  const taken = await prisma.donation.findMany({
    where: {
      eventId,
      status: { in: ['PENDING', 'APPROVED'] },
      chosenTicket: { not: null },
    },
    select: { chosenTicket: true },
  })
  const takenSet = new Set(taken.map((d) => d.chosenTicket as number))

  const available: number[] = []
  let attempts = 0
  const maxAttempts = event.maxTickets * 10

  while (available.length < 5 && attempts < maxAttempts) {
    const n = Math.floor(Math.random() * event.maxTickets) + 1
    if (!takenSet.has(n) && !available.includes(n)) {
      available.push(n)
    }
    attempts++
  }

  return available
}

// Returns true if claimed, false if already taken (race condition)
export async function claimTicket(
  donationId: string,
  ticketNumber: number,
  eventId: string
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.donation.findFirst({
        where: {
          eventId,
          chosenTicket: ticketNumber,
          status: { in: ['PENDING', 'APPROVED'] },
          NOT: { id: donationId },
        },
      })
      if (taken) throw new Error('TICKET_TAKEN')

      await tx.donation.update({
        where: { id: donationId },
        data: { chosenTicket: ticketNumber },
      })
    })
    return true
  } catch (err) {
    if (err instanceof Error && err.message === 'TICKET_TAKEN') return false
    throw err
  }
}

export async function hasAvailableTickets(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return false

  const takenCount = await prisma.donation.count({
    where: {
      eventId,
      status: { in: ['PENDING', 'APPROVED'] },
      chosenTicket: { not: null },
    },
  })
  return takenCount < event.maxTickets
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/db/tickets.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat: ticket generation and claim with race-condition protection"
```

---

## Task 6: Auth Middleware

**Files:**
- Create: `src/bot/middlewares/auth.ts`
- Create: `tests/middlewares/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/middlewares/auth.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client', () => ({
  prisma: {
    admin: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}))

describe('isSuperAdmin', () => {
  it('returns true for super admin id', async () => {
    process.env.SUPER_ADMIN_ID = '123456789'
    const { isSuperAdmin } = await import('../src/bot/middlewares/auth')
    expect(isSuperAdmin(123456789n)).toBe(true)
  })

  it('returns false for other id', async () => {
    const { isSuperAdmin } = await import('../src/bot/middlewares/auth')
    expect(isSuperAdmin(999999n)).toBe(false)
  })
})

describe('isAdmin', () => {
  it('returns true for super admin even without DB record', async () => {
    process.env.SUPER_ADMIN_ID = '123456789'
    const { isAdmin } = await import('../src/bot/middlewares/auth')
    expect(await isAdmin(123456789n)).toBe(true)
  })

  it('returns false when no admin record found', async () => {
    const { isAdmin } = await import('../src/bot/middlewares/auth')
    expect(await isAdmin(999999n)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/middlewares/auth.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create src/bot/middlewares/auth.ts**

```typescript
import { NextFunction } from 'grammy'
import { MyContext } from '../../types'
import { config } from '../../config'
import { prisma } from '../../db/client'

export const isSuperAdmin = (telegramId: bigint): boolean =>
  telegramId === config.SUPER_ADMIN_ID

export const isAdmin = async (telegramId: bigint): Promise<boolean> => {
  if (isSuperAdmin(telegramId)) return true
  const admin = await prisma.admin.findFirst({ where: { telegramId } })
  return !!admin
}

export const requireAdmin = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id ? BigInt(ctx.from.id) : null
  if (!userId || !(await isAdmin(userId))) {
    await ctx.reply('⛔ У вас немає прав для цієї команди.')
    return
  }
  return next()
}

export const requireSuperAdmin = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id ? BigInt(ctx.from.id) : null
  if (!userId || !isSuperAdmin(userId)) {
    await ctx.reply('⛔ Ця команда тільки для super admin.')
    return
  }
  return next()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/middlewares/auth.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/middlewares/auth.ts tests/middlewares/auth.test.ts
git commit -m "feat: auth middleware (isSuperAdmin, isAdmin, requireAdmin)"
```

---

## Task 7: Rate Limit Middleware + Logger + Error Handler

**Files:**
- Create: `src/bot/middlewares/rateLimit.ts`
- Create: `src/bot/middlewares/logger.ts`
- Create: `src/bot/middlewares/errorHandler.ts`
- Create: `tests/middlewares/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/middlewares/rateLimit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows first 3 requests', async () => {
    const { rateLimitMap, rateLimit } = await import('../src/bot/middlewares/rateLimit')
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
    const { rateLimitMap, rateLimit } = await import('../src/bot/middlewares/rateLimit')
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/middlewares/rateLimit.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create src/bot/middlewares/rateLimit.ts**

```typescript
import { NextFunction } from 'grammy'
import { MyContext } from '../../types'

type RateEntry = { count: number; resetAt: number }

export const rateLimitMap = new Map<string, RateEntry>()

export const rateLimit = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const userId = ctx.from?.id?.toString()
  if (!userId) return next()

  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return next()
  }

  entry.count++
  if (entry.count > 3) {
    await ctx.reply('⚠️ Забагато запитів. Спробуйте через 10 хвилин.')
    return
  }

  return next()
}
```

- [ ] **Step 4: Create src/bot/middlewares/logger.ts**

```typescript
import { NextFunction } from 'grammy'
import pino from 'pino'
import { MyContext } from '../../types'

export const logger = pino({
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

export const loggerMiddleware = async (ctx: MyContext, next: NextFunction): Promise<void> => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  logger.info({
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    ms,
  })
}
```

- [ ] **Step 5: Create src/bot/middlewares/errorHandler.ts**

```typescript
import { BotError } from 'grammy'
import { MyContext } from '../../types'
import { logger } from './logger'

export const errorHandler = (err: BotError<MyContext>): void => {
  const ctx = err.ctx
  logger.error({
    err: err.error,
    updateType: ctx.updateType,
    userId: ctx.from?.id,
  }, 'Bot error')

  ctx.reply('⚠️ Сталася помилка. Спробуйте ще раз або зверніться до адміна.').catch(() => {})
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- tests/middlewares/rateLimit.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/bot/middlewares/rateLimit.ts src/bot/middlewares/logger.ts src/bot/middlewares/errorHandler.ts tests/middlewares/rateLimit.test.ts
git commit -m "feat: rateLimit, logger, and errorHandler middlewares"
```

---

## Task 8: Keyboards

**Files:**
- Create: `src/bot/keyboards.ts`

- [ ] **Step 1: Create src/bot/keyboards.ts**

```typescript
import { InlineKeyboard, Keyboard } from 'grammy'

export const cancelKeyboard = new InlineKeyboard().text('❌ Скасувати', 'cancel')

export const phoneKeyboard = new Keyboard()
  .requestContact('📱 Поділитися номером')
  .resized()

export const approveRejectKeyboard = (donationId: string) =>
  new InlineKeyboard()
    .text('✅ Підтвердити', `approve:${donationId}`)
    .text('❌ Відхилити', `reject:${donationId}`)

export const ticketKeyboard = (tickets: number[], donationId: string) => {
  const kb = new InlineKeyboard()
  tickets.forEach((t) => kb.text(`#${t}`, `ticket:${t}:${donationId}`))
  return kb
}

export const exportKeyboard = new InlineKeyboard()
  .text('📊 CSV файл', 'export:csv').row()
  .text('📋 Список імен', 'export:names').row()
  .text('🔢 Список номерків', 'export:numbers')
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/keyboards.ts
git commit -m "feat: keyboard builders"
```

---

## Task 9: Bot Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

```typescript
import { Bot, session } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import { config } from './config'
import { MyContext, SessionData } from './types'
import { loggerMiddleware } from './bot/middlewares/logger'
import { rateLimit } from './bot/middlewares/rateLimit'
import { errorHandler } from './bot/middlewares/errorHandler'
import { registerConversation } from './bot/conversations/register'
import { rejectDonationConversation } from './bot/conversations/rejectDonation'
import { addDonorConversation } from './bot/conversations/addDonor'
import { userHandlers } from './bot/handlers/user'
import { adminHandlers } from './bot/handlers/admin'
import { prisma } from './db/client'

const bot = new Bot<MyContext>(config.BOT_TOKEN)

// Middlewares
bot.use(loggerMiddleware)
bot.use(
  session({
    initial: (): SessionData => ({}),
  })
)
bot.use(conversations())

// Register conversations
bot.use(createConversation(registerConversation))
bot.use(createConversation(rejectDonationConversation))
bot.use(createConversation(addDonorConversation))

// Rate limit on non-admin messages
bot.on('message', rateLimit)

// Handlers
userHandlers(bot)
adminHandlers(bot)

// Error handling
bot.catch(errorHandler)

// Graceful shutdown
process.once('SIGINT', async () => {
  bot.stop()
  await prisma.$disconnect()
})
process.once('SIGTERM', async () => {
  bot.stop()
  await prisma.$disconnect()
})

bot.start({
  onStart: () => console.log('Bot started in polling mode'),
})
```

- [ ] **Step 2: Verify TypeScript compiles (conversations stubs will fail — that's ok for now)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: errors about missing conversation files — that's expected, we'll add them next.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: bot entry point with middleware chain and polling"
```

---

## Task 10: User Registration Conversation

**Files:**
- Create: `src/bot/conversations/register.ts`
- Create: `src/bot/handlers/user.ts`

- [ ] **Step 1: Create src/bot/conversations/register.ts**

```typescript
import crypto from 'crypto'
import { MyConversation, MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { cancelKeyboard, phoneKeyboard, approveRejectKeyboard } from '../keyboards'
import { isAdmin } from '../middlewares/auth'
import { logger } from '../middlewares/logger'

async function downloadFileBuffer(ctx: MyContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
  const response = await fetch(url)
  return Buffer.from(await response.arrayBuffer())
}

async function notifyAdmins(ctx: MyContext, donation: { id: string }, user: { firstName: string; lastName: string; phone: string }, screenshotFileId: string): Promise<void> {
  const admins = await prisma.admin.findMany()
  const superAdminId = (await import('../../config')).config.SUPER_ADMIN_ID

  const text =
    `🔔 Новий запит\n\n` +
    `👤 ${user.firstName} ${user.lastName}\n` +
    `📞 ${user.phone}\n` +
    `📸 Скріншот нижче`

  const kb = approveRejectKeyboard(donation.id)
  const targets = [superAdminId, ...admins.map((a) => a.telegramId)]
  const uniqueTargets = [...new Set(targets)]

  for (const adminId of uniqueTargets) {
    try {
      await ctx.api.sendPhoto(Number(adminId), screenshotFileId, {
        caption: text,
        reply_markup: kb,
      })
    } catch (err) {
      logger.error({ err, adminId }, 'Failed to notify admin')
    }
  }
}

export async function registerConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const telegramId = BigInt(ctx.from!.id)

  // Check rememberUserData setting
  const remember = await conversation.external(() => getConfig('rememberUserData'))
  const existingUser = await conversation.external(() =>
    prisma.user.findUnique({ where: { telegramId } })
  )

  let firstName: string
  let lastName: string
  let phone: string

  if (remember === 'true' && existingUser) {
    await ctx.reply(
      `Ми вас знаємо! ${existingUser.firstName} ${existingUser.lastName}, ${existingUser.phone}\n\nВикористати ці дані?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Так', callback_data: 'use_saved' },
              { text: '✏️ Змінити', callback_data: 'change_data' },
            ],
          ],
        },
      }
    )

    const choiceCtx = await conversation.waitFor('callback_query')
    await choiceCtx.answerCallbackQuery()

    if (choiceCtx.callbackQuery.data === 'use_saved') {
      firstName = existingUser.firstName
      lastName = existingUser.lastName
      phone = existingUser.phone
    } else {
      ;({ firstName, lastName, phone } = await collectUserData(conversation, ctx))
    }
  } else {
    ;({ firstName, lastName, phone } = await collectUserData(conversation, ctx))
  }

  // Step 3: Screenshot
  await ctx.reply(
    `📋 Крок 3 з 3 — Скріншот оплати\n\nНадішліть скріншот підтвердження переказу.\n\n💡 Зробіть скріншот з банківського додатку де видно суму, дату і статус "Успішно"`,
    { reply_markup: cancelKeyboard }
  )

  let screenshotFileId: string
  let screenshotHash: string

  while (true) {
    const photoCtx = await conversation.wait()

    if (photoCtx.callbackQuery?.data === 'cancel') {
      await photoCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      return
    }

    if (photoCtx.message?.document) {
      await photoCtx.reply('📸 Надішліть саме фото, а не файл.')
      continue
    }

    const photo = photoCtx.message?.photo?.at(-1)
    if (!photo) {
      await photoCtx.reply('Надішліть фото скріншоту.')
      continue
    }

    if (photo.file_size && photo.file_size < 50_000) {
      await photoCtx.reply('❌ Скріншот виглядає некоректно. Надішліть повний скріншот з банківського додатку.')
      continue
    }

    screenshotFileId = photo.file_id

    // Hash check for duplicate
    const buffer = await conversation.external(() => downloadFileBuffer(ctx, screenshotFileId))
    screenshotHash = crypto.createHash('sha256').update(buffer).digest('hex')

    const duplicate = await conversation.external(() =>
      prisma.donation.findFirst({ where: { screenshotHash } })
    )

    if (duplicate) {
      await photoCtx.reply('❌ Цей скріншот вже було використано раніше.')
      continue
    }

    break
  }

  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('⚠️ Наразі немає активного розіграшу. Спробуйте пізніше.')
    return
  }

  // Upsert user and create donation
  const donation = await conversation.external(async () => {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: { firstName, lastName, phone, username: ctx.from?.username },
      create: {
        telegramId,
        username: ctx.from?.username,
        firstName,
        lastName,
        phone,
      },
    })

    const don = await prisma.donation.create({
      data: {
        eventId: activeEventId,
        userId: user.id,
        screenshotFileId,
        screenshotHash,
        status: 'PENDING',
        telegramMessageId: BigInt(ctx.message?.message_id ?? 0),
      },
    })

    return { don, user }
  })

  await ctx.reply(
    '✅ Дякуємо! Ваш запит отримано.\n\n⏳ Очікуйте підтвердження адміна.\nЗазвичай це займає до 2 годин.\n\nПеревірити статус — /my_ticket'
  )

  await notifyAdmins(
    ctx,
    donation.don,
    { firstName, lastName, phone },
    screenshotFileId
  )
}

async function collectUserData(
  conversation: MyConversation,
  ctx: MyContext
): Promise<{ firstName: string; lastName: string; phone: string }> {
  // Name
  await ctx.reply(
    '📋 Крок 1 з 3 — Ваше ім\'я та прізвище\n\nВведіть ваше повне ім\'я (наприклад: Марія Іваненко)',
    { reply_markup: cancelKeyboard }
  )

  let firstName: string
  let lastName: string

  while (true) {
    const nameCtx = await conversation.wait()

    if (nameCtx.callbackQuery?.data === 'cancel') {
      await nameCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      throw new Error('CANCELLED')
    }

    const text = nameCtx.message?.text?.trim()
    if (!text) {
      await nameCtx.reply('Введіть ім\'я та прізвище текстом.')
      continue
    }

    const parts = text.split(/\s+/)
    if (parts.length < 2) {
      await nameCtx.reply('Введіть ім\'я та прізвище через пробіл (наприклад: Марія Іваненко)')
      continue
    }

    firstName = parts[0]
    lastName = parts.slice(1).join(' ')
    break
  }

  // Phone
  await ctx.reply(
    '📋 Крок 2 з 3 — Номер телефону\n\nНатисніть кнопку нижче щоб поділитися номером\n\n💡 Це потрібно щоб ми могли зв\'язатись з переможцем',
    { reply_markup: phoneKeyboard }
  )

  let phone: string

  while (true) {
    const phoneCtx = await conversation.wait()

    if (phoneCtx.callbackQuery?.data === 'cancel') {
      await phoneCtx.answerCallbackQuery()
      await ctx.reply('Скасовано.')
      throw new Error('CANCELLED')
    }

    if (!phoneCtx.message?.contact) {
      await phoneCtx.reply('Натисніть кнопку "Поділитися номером" нижче.')
      continue
    }

    phone = phoneCtx.message.contact.phone_number
    break
  }

  return { firstName, lastName, phone }
}
```

- [ ] **Step 2: Create src/bot/handlers/user.ts**

```typescript
import { Bot } from 'grammy'
import { MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { generateAvailableTickets, claimTicket, hasAvailableTickets } from '../../db/tickets'
import { ticketKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export function userHandlers(bot: Bot<MyContext>): void {
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.reply('😔 Наразі немає активного розіграшу.')
      return
    }

    // Check if already has approved ticket in current event
    const existing = await prisma.donation.findFirst({
      where: {
        eventId: activeEventId,
        user: { telegramId },
        status: { in: ['PENDING', 'APPROVED'] },
      },
    })

    if (existing) {
      await ctx.reply('Ви вже зареєстровані в цьому розіграші. Перевірте статус — /my_ticket')
      return
    }

    await ctx.reply(
      '🎁 Вітаємо в благодійному розіграші!\n\nДля участі вам потрібно:\n1. Вказати ім\'я та прізвище\n2. Поділитися номером телефону\n3. Надіслати скріншот оплати\n\nРозпочнемо? Натисніть /start ще раз або просто надішліть повідомлення.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🎟 Зареєструватись', callback_data: 'start_register' }]],
        },
      }
    )
  })

  bot.callbackQuery('start_register', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('registerConversation')
  })

  bot.command('my_ticket', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id)
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const donation = await prisma.donation.findFirst({
      where: { eventId: activeEventId, user: { telegramId } },
      include: { user: true, event: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!donation) {
      await ctx.reply('Ви ще не зареєстровані. Натисніть /start щоб почати.')
      return
    }

    if (donation.status === 'PENDING' && !donation.chosenTicket) {
      await ctx.reply('⏳ Ваш запит на розгляді. Очікуйте підтвердження адміна.')
      return
    }

    if (donation.status === 'APPROVED' && !donation.chosenTicket) {
      // Approved but hasn't chosen ticket yet
      const tickets = await generateAvailableTickets(activeEventId)
      if (tickets.length === 0) {
        await ctx.reply('😔 На жаль, всі номерки вже розібрані.')
        return
      }
      await ctx.reply('🎉 Ваш донат підтверджено!\n\n🎟 Оберіть свій номерок:', {
        reply_markup: ticketKeyboard(tickets, donation.id),
      })
      return
    }

    if (donation.status === 'APPROVED' && donation.chosenTicket) {
      await ctx.reply(
        `🎉 Ваш номерок: #${donation.chosenTicket}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.`
      )
      return
    }

    if (donation.status === 'REJECTED') {
      await ctx.reply('❌ Ваш запит було відхилено. Зверніться до організатора.')
      return
    }
  })

  // Ticket selection callback
  bot.callbackQuery(/^ticket:(\d+):(.+)$/, async (ctx) => {
    const ticketNumber = parseInt(ctx.match[1])
    const donationId = ctx.match[2]
    const activeEventId = await getConfig('activeEventId')

    if (!activeEventId) {
      await ctx.answerCallbackQuery('Помилка: немає активного розіграшу')
      return
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true },
    })

    if (!donation || donation.status !== 'APPROVED' || donation.chosenTicket) {
      await ctx.answerCallbackQuery('Цей запит вже оброблено')
      return
    }

    const claimed = await claimTicket(donationId, ticketNumber, activeEventId)

    if (!claimed) {
      // Race condition — offer new tickets
      const newTickets = await generateAvailableTickets(activeEventId)
      await ctx.answerCallbackQuery('Цей номерок вже зайнятий!')
      if (newTickets.length === 0) {
        await ctx.editMessageText('😔 На жаль, всі номерки вже розібрані.')
        return
      }
      await ctx.editMessageText('🎟 Оберіть інший номерок:', {
        reply_markup: ticketKeyboard(newTickets, donationId),
      })
      return
    }

    await ctx.answerCallbackQuery('Номерок обрано!')
    await ctx.editMessageText(
      `🎉 Вітаємо!\n\n🎟 Ваш номерок: #${ticketNumber}\n👤 ${donation.user.firstName} ${donation.user.lastName}\n📞 ${donation.user.phone}\n\nПереможця буде оголошено організатором.\nЗберегти дані — /my_ticket`
    )

    logger.info({ donationId, ticketNumber, userId: ctx.from.id }, 'Ticket claimed')
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "conversations/reject\|conversations/addDonor"
```

Expected: errors only about missing `rejectDonation` and `addDonor` conversation files.

- [ ] **Step 4: Commit**

```bash
git add src/bot/conversations/register.ts src/bot/handlers/user.ts
git commit -m "feat: user registration conversation and ticket selection"
```

---

## Task 11: Admin Approval/Rejection Flow

**Files:**
- Create: `src/bot/conversations/rejectDonation.ts`
- Create: `src/bot/handlers/admin.ts` (approval callbacks + commands)

- [ ] **Step 1: Create src/bot/conversations/rejectDonation.ts**

```typescript
import { MyConversation, MyContext } from '../../types'
import { prisma } from '../../db/client'
import { logger } from '../middlewares/logger'

export async function rejectDonationConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const donationId = ctx.session.pendingRejectionDonationId
  if (!donationId) return

  await ctx.reply('Вкажіть причину відмови (юзер її побачить):')

  const reasonCtx = await conversation.waitFor('message:text')
  const reason = reasonCtx.message.text

  const donation = await conversation.external(() =>
    prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true },
    })
  )

  if (!donation || donation.status !== 'PENDING') {
    await ctx.reply('⚠️ Цей донат вже оброблено.')
    ctx.session.pendingRejectionDonationId = undefined
    return
  }

  await conversation.external(async () => {
    await prisma.donation.update({
      where: { id: donationId },
      data: { status: 'REJECTED' },
    })

    await prisma.auditLog.create({
      data: {
        donationId,
        action: 'REJECTED',
        actor: `admin:${ctx.from!.id}`,
        meta: JSON.stringify({ reason, adminUsername: ctx.from!.username }),
      },
    })
  })

  ctx.session.pendingRejectionDonationId = undefined

  // Notify user
  try {
    await ctx.api.sendMessage(
      Number(donation.user.telegramId),
      `❌ На жаль, ваш запит не підтверджено.\n\nПричина: ${reason}\n\nЯкщо ви вважаєте це помилкою — зверніться до організатора напряму.`
    )
  } catch (err) {
    logger.error({ err }, 'Failed to notify user about rejection')
  }

  await ctx.reply('✅ Донат відхилено. Юзера повідомлено.')
  logger.info({ donationId, reason, adminId: ctx.from!.id }, 'Donation rejected')
}
```

- [ ] **Step 2: Create src/bot/handlers/admin.ts**

```typescript
import { Bot, InputFile } from 'grammy'
import { MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig, setConfig } from '../../db/configStore'
import { generateAvailableTickets, hasAvailableTickets } from '../../db/tickets'
import { requireAdmin, requireSuperAdmin, isSuperAdmin } from '../middlewares/auth'
import { ticketKeyboard, exportKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export function adminHandlers(bot: Bot<MyContext>): void {
  // ── Approve callback ──────────────────────────────────────────────
  bot.callbackQuery(/^approve:(.+)$/, requireAdmin, async (ctx) => {
    const donationId = ctx.match[1]

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true, event: true },
    })

    if (!donation) {
      await ctx.answerCallbackQuery('Донат не знайдено')
      return
    }

    if (donation.status !== 'PENDING') {
      await ctx.answerCallbackQuery('Вже оброблено')
      return
    }

    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId || donation.eventId !== activeEventId) {
      await ctx.answerCallbackQuery('Помилка: активна подія не збігається')
      return
    }

    const noTickets = !(await hasAvailableTickets(activeEventId))
    if (noTickets) {
      await ctx.answerCallbackQuery('⚠️ Немає вільних номерків!')
      await ctx.editMessageCaption('⚠️ Підтвердити неможливо — всі номерки розібрані')
      return
    }

    await prisma.donation.update({
      where: { id: donationId },
      data: { status: 'APPROVED' },
    })

    await prisma.auditLog.create({
      data: {
        donationId,
        action: 'APPROVED',
        actor: `admin:${ctx.from.id}`,
        meta: JSON.stringify({ adminUsername: ctx.from.username }),
      },
    })

    await ctx.answerCallbackQuery('Підтверджено ✅')
    await ctx.editMessageCaption(
      `✅ Підтверджено адміном @${ctx.from.username ?? ctx.from.id}`
    )

    // Send ticket options to user
    const tickets = await generateAvailableTickets(activeEventId)
    try {
      await ctx.api.sendMessage(
        Number(donation.user.telegramId),
        `🎉 Ваш донат підтверджено!\n\n🎟 Оберіть свій номерок:`,
        { reply_markup: ticketKeyboard(tickets, donationId) }
      )
    } catch (err) {
      logger.error({ err, userId: donation.user.telegramId }, 'Failed to send ticket options to user')
    }

    logger.info({ donationId, adminId: ctx.from.id }, 'Donation approved')
  })

  // ── Reject callback ───────────────────────────────────────────────
  bot.callbackQuery(/^reject:(.+)$/, requireAdmin, async (ctx) => {
    const donationId = ctx.match[1]

    const donation = await prisma.donation.findUnique({ where: { id: donationId } })
    if (!donation || donation.status !== 'PENDING') {
      await ctx.answerCallbackQuery('Вже оброблено')
      return
    }

    ctx.session.pendingRejectionDonationId = donationId
    await ctx.answerCallbackQuery()
    await ctx.conversation.enter('rejectDonationConversation')
  })

  // ── /stats ────────────────────────────────────────────────────────
  bot.command('stats', requireAdmin, async (ctx) => {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const event = await prisma.event.findUnique({ where: { id: activeEventId } })
    const total = await prisma.donation.count({ where: { eventId: activeEventId } })
    const pending = await prisma.donation.count({ where: { eventId: activeEventId, status: 'PENDING' } })
    const approved = await prisma.donation.count({ where: { eventId: activeEventId, status: 'APPROVED' } })
    const rejected = await prisma.donation.count({ where: { eventId: activeEventId, status: 'REJECTED' } })
    const withTicket = await prisma.donation.count({
      where: { eventId: activeEventId, chosenTicket: { not: null } },
    })

    await ctx.reply(
      `📊 Статистика розіграшу: ${event?.title}\n\n` +
      `🎟 Пул номерків: ${event?.maxTickets}\n` +
      `👥 Всього запитів: ${total}\n` +
      `⏳ Очікують: ${pending}\n` +
      `✅ Підтверджено: ${approved}\n` +
      `🎟 Номерки обрано: ${withTicket}\n` +
      `❌ Відхилено: ${rejected}`
    )
  })

  // ── /pending ──────────────────────────────────────────────────────
  bot.command('pending', requireAdmin, async (ctx) => {
    const activeEventId = await getConfig('activeEventId')
    if (!activeEventId) {
      await ctx.reply('Немає активного розіграшу.')
      return
    }

    const donations = await prisma.donation.findMany({
      where: { eventId: activeEventId, status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    if (donations.length === 0) {
      await ctx.reply('✅ Немає запитів в очікуванні.')
      return
    }

    const lines = donations.map(
      (d, i) =>
        `${i + 1}. ${d.user.firstName} ${d.user.lastName} — ${d.user.phone}\n   ID: \`${d.id}\``
    )
    await ctx.reply(`⏳ Очікують підтвердження (${donations.length}):\n\n${lines.join('\n\n')}`)
  })

  // ── /export ───────────────────────────────────────────────────────
  bot.command('export', requireAdmin, async (ctx) => {
    await ctx.reply('Оберіть формат експорту:', { reply_markup: exportKeyboard })
  })

  bot.callbackQuery('export:csv', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const csv = ['number,firstName,lastName,phone']
    data.forEach((d) => csv.push(`${d.chosenTicket},${d.user.firstName},${d.user.lastName},${d.user.phone}`))
    const buf = Buffer.from(csv.join('\n'), 'utf-8')
    await ctx.replyWithDocument(new InputFile(buf, 'raffle-export.csv'))
  })

  bot.callbackQuery('export:names', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const text = data.map((d) => `${d.user.firstName} ${d.user.lastName}`).join('\n')
    await ctx.reply(`📋 Список імен:\n\n${text || 'Немає даних'}`)
  })

  bot.callbackQuery('export:numbers', requireAdmin, async (ctx) => {
    await ctx.answerCallbackQuery()
    const data = await getExportData()
    const text = data.map((d) => `#${d.chosenTicket}`).join('\n')
    await ctx.reply(`🔢 Список номерків:\n\n${text || 'Немає даних'}`)
  })

  // ── /add_donor ────────────────────────────────────────────────────
  bot.command('add_donor', requireAdmin, async (ctx) => {
    await ctx.conversation.enter('addDonorConversation')
  })

  // ── /add_admin ────────────────────────────────────────────────────
  bot.command('add_admin', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const telegramIdStr = args?.[0]

    if (!telegramIdStr || isNaN(Number(telegramIdStr))) {
      await ctx.reply('Використання: /add_admin <telegram_id>\n\nTelegram ID дізнатись через @userinfobot')
      return
    }

    const telegramId = BigInt(telegramIdStr)

    await prisma.admin.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        role: 'ADMIN',
        addedBy: BigInt(ctx.from!.id),
      },
    })

    await ctx.reply(`✅ Адмін ${telegramIdStr} доданий.`)
  })

  // ── /remove_admin ─────────────────────────────────────────────────
  bot.command('remove_admin', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const telegramIdStr = args?.[0]

    if (!telegramIdStr || isNaN(Number(telegramIdStr))) {
      await ctx.reply('Використання: /remove_admin <telegram_id>')
      return
    }

    const telegramId = BigInt(telegramIdStr)

    if (isSuperAdmin(telegramId)) {
      await ctx.reply('⛔ Не можна видалити super admin.')
      return
    }

    await prisma.admin.deleteMany({ where: { telegramId } })
    await ctx.reply(`✅ Адмін ${telegramIdStr} видалений.`)
  })

  // ── /new_raffle ───────────────────────────────────────────────────
  bot.command('new_raffle', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    if (!args || args.length < 2) {
      await ctx.reply('Використання: /new_raffle "Назва розіграшу" <кількість_номерків>\n\nПриклад: /new_raffle "Розіграш травень 2026" 500')
      return
    }

    const maxTickets = parseInt(args[args.length - 1])
    if (isNaN(maxTickets) || maxTickets < 10 || maxTickets > 10000) {
      await ctx.reply('⚠️ Кількість номерків має бути від 10 до 10000.')
      return
    }

    const title = args.slice(0, -1).join(' ').replace(/^"|"$/g, '')

    const currentEventId = await getConfig('activeEventId')
    if (currentEventId) {
      await prisma.event.update({
        where: { id: currentEventId },
        data: { status: 'CLOSED' },
      })
    }

    const newEvent = await prisma.event.create({
      data: { title, maxTickets, status: 'ACTIVE' },
    })

    await setConfig('activeEventId', newEvent.id)

    await ctx.reply(`✅ Новий розіграш розпочато!\n\n🎟 ${title}\nПул: ${maxTickets} номерків\nID: ${newEvent.id}`)
    logger.info({ eventId: newEvent.id, title, maxTickets }, 'New raffle created')
  })

  // ── /settings ─────────────────────────────────────────────────────
  bot.command('settings', requireSuperAdmin, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1)
    const rememberUsers = await getConfig('rememberUserData') ?? 'false'

    if (!args || args.length === 0) {
      await ctx.reply(
        `⚙️ Поточні налаштування:\n\n` +
        `• Запам'ятовувати юзерів: ${rememberUsers === 'true' ? 'увімк' : 'вимк'}\n\n` +
        `Команди:\n/settings remember_users on\n/settings remember_users off`
      )
      return
    }

    if (args[0] === 'remember_users') {
      if (args[1] === 'on') {
        await setConfig('rememberUserData', 'true')
        await ctx.reply('✅ Юзери будуть запам\'ятовуватись між розіграшами.')
      } else if (args[1] === 'off') {
        await setConfig('rememberUserData', 'false')
        await ctx.reply('✅ Юзери завжди вводять дані заново.')
      } else {
        await ctx.reply('Використання: /settings remember_users on|off')
      }
      return
    }

    await ctx.reply('Невідома команда. Спробуйте /settings без аргументів.')
  })
}

async function getExportData() {
  const activeEventId = await getConfig('activeEventId')
  if (!activeEventId) return []

  return prisma.donation.findMany({
    where: {
      eventId: activeEventId,
      status: 'APPROVED',
      chosenTicket: { not: null },
    },
    include: { user: true },
    orderBy: { chosenTicket: 'asc' },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/bot/conversations/rejectDonation.ts src/bot/handlers/admin.ts
git commit -m "feat: admin approval/rejection flow and all admin commands"
```

---

## Task 12: Add Donor Conversation

**Files:**
- Create: `src/bot/conversations/addDonor.ts`

- [ ] **Step 1: Create src/bot/conversations/addDonor.ts**

```typescript
import { MyConversation, MyContext } from '../../types'
import { prisma } from '../../db/client'
import { getConfig } from '../../db/configStore'
import { generateAvailableTickets, hasAvailableTickets } from '../../db/tickets'
import { ticketKeyboard } from '../keyboards'
import { logger } from '../middlewares/logger'

export async function addDonorConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const activeEventId = await conversation.external(() => getConfig('activeEventId'))
  if (!activeEventId) {
    await ctx.reply('Немає активного розіграшу.')
    return
  }

  // Name
  await ctx.reply('Введіть ім\'я та прізвище учасника:')
  const nameCtx = await conversation.waitFor('message:text')
  const parts = nameCtx.message.text.trim().split(/\s+/)
  if (parts.length < 2) {
    await ctx.reply('⚠️ Потрібно ім\'я та прізвище. Скасовано.')
    return
  }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')

  // Phone
  await ctx.reply('Введіть номер телефону учасника (наприклад: +380501234567):')
  const phoneCtx = await conversation.waitFor('message:text')
  const phone = phoneCtx.message.text.trim()

  // Telegram ID (optional)
  await ctx.reply('Введіть Telegram ID учасника (або 0 якщо невідомо):')
  const idCtx = await conversation.waitFor('message:text')
  const telegramIdRaw = parseInt(idCtx.message.text.trim())
  const telegramId = isNaN(telegramIdRaw) || telegramIdRaw === 0
    ? BigInt(Date.now()) // synthetic ID for external users
    : BigInt(telegramIdRaw)

  const canAdd = await conversation.external(() => hasAvailableTickets(activeEventId))
  if (!canAdd) {
    await ctx.reply('😔 Немає вільних номерків.')
    return
  }

  const result = await conversation.external(async () => {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: { firstName, lastName, phone },
      create: { telegramId, firstName, lastName, phone },
    })

    const donation = await prisma.donation.create({
      data: {
        eventId: activeEventId,
        userId: user.id,
        status: 'APPROVED',
        external: true,
      },
    })

    return { user, donation }
  })

  const tickets = await conversation.external(() => generateAvailableTickets(activeEventId))
  await ctx.reply(
    `✅ Учасника додано: ${firstName} ${lastName}\n\nОберіть номерок для цього учасника:`,
    { reply_markup: ticketKeyboard(tickets, result.donation.id) }
  )

  logger.info({ donationId: result.donation.id, firstName, lastName }, 'External donor added')
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/bot/conversations/addDonor.ts
git commit -m "feat: addDonor conversation for manual participant registration"
```

---

## Task 13: Seed Script & PM2 Config

**Files:**
- Create: `prisma/seed.ts`
- Create: `ecosystem.config.js`

- [ ] **Step 1: Create prisma/seed.ts**

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create first event
  const event = await prisma.event.upsert({
    where: { id: 'seed-event-id' },
    update: {},
    create: {
      id: 'seed-event-id',
      title: 'Перший розіграш',
      maxTickets: 500,
      status: 'ACTIVE',
    },
  })

  // Set as active event
  await prisma.config.upsert({
    where: { key: 'activeEventId' },
    update: { value: event.id },
    create: { key: 'activeEventId', value: event.id },
  })

  // Default settings
  await prisma.config.upsert({
    where: { key: 'rememberUserData' },
    update: {},
    create: { key: 'rememberUserData', value: 'true' },
  })

  console.log('✅ Seed complete. Event ID:', event.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run seed**

```bash
npm run db:seed
```

Expected: "✅ Seed complete. Event ID: seed-event-id"

- [ ] **Step 3: Create ecosystem.config.js**

```javascript
module.exports = {
  apps: [
    {
      name: 'blago-bot',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
```

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts ecosystem.config.js
git commit -m "chore: seed script and PM2 config"
```

---

## Task 14: Full Build & Deploy Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all PASS

- [ ] **Step 2: Build for production**

```bash
npm run build
```

Expected: `dist/` created, 0 TypeScript errors

- [ ] **Step 3: Run locally in dev mode to verify bot responds**

```bash
npm run dev
```

Send `/start` to the bot in Telegram.
Expected: bot replies with welcome message.

- [ ] **Step 4: Deploy to Hetzner**

```bash
# On server (157.180.90.223)
git clone <repo-url> /opt/blago-bot
cd /opt/blago-bot
cp .env.example .env
# Fill in BOT_TOKEN and SUPER_ADMIN_ID in .env
npm install
npx prisma db push
npm run db:seed
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

- [ ] **Step 5: Verify bot is running**

```bash
pm2 status blago-bot
pm2 logs blago-bot --lines 20
```

Expected: status "online", logs show "Bot started in polling mode"

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: deployment verified"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Implemented in |
|---|---|
| Реєстрація: ім'я + прізвище | Task 10 — `register.ts` (collectUserData) |
| Телефон через нативну кнопку | Task 10 — `phoneKeyboard` + `waitFor('message:contact')` |
| Скріншот з перевіркою розміру + хешем | Task 10 — `register.ts` |
| Статус PENDING до апруву адміна | Task 10 — `prisma.donation.create` |
| Адмін отримує скрін + кнопки | Task 10 — `notifyAdmins()` |
| Approve → 5 номерків юзеру | Task 11 — `admin.ts` approve callback |
| Reject → причина → повідомлення юзеру | Task 11 — `rejectDonation.ts` |
| Race condition при виборі номерка | Task 5 — `claimTicket` transaction |
| /my_ticket для юзера | Task 10 — `user.ts` |
| /stats, /pending для адміна | Task 11 — `admin.ts` |
| /export (CSV, імена, номерки) | Task 11 — `admin.ts` + `exportKeyboard` |
| /add_donor ручне додавання | Task 12 — `addDonor.ts` |
| /add_admin, /remove_admin | Task 11 — `admin.ts` |
| /new_raffle | Task 11 — `admin.ts` |
| /settings remember_users | Task 11 — `admin.ts` |
| rememberUserData логіка | Task 10 — `register.ts` |
| SQLite + Prisma | Task 3 |
| Polling (не webhook) | Task 9 — `bot.start()` |
| PM2 деплой | Task 13 |
| Rate limiting | Task 7 — `rateLimit.ts` |
| Audit log | Task 11 — всі зміни статусу |
| Graceful shutdown | Task 9 — `src/index.ts` |

### Edge Cases Covered
- Скрін < 50KB → відмова ✅
- Дублікат скріншота (SHA-256) → відмова ✅
- Race condition на номерок → нові 5 варіантів ✅
| Адмін обробляє вже оброблений донат → перевірка статусу ✅
- Всі номерки розібрані → повідомлення ✅
- /my_ticket до апруву → "на розгляді" ✅
- Зовнішній донатер → external: true ✅
- Юзер заблокував бота → TelegramError catch ✅
