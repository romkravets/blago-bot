# Charity Raffle Bot — CLAUDE.md

## Що це за проєкт

Telegram-бот для проведення благодійних розіграшів. Юзер реєструється (ім'я, телефон, скріншот оплати), адмін підтверджує скрін, після підтвердження юзер обирає номерок з 5 доступних. Розіграш організатор проводить вручну (wheelofnames.com або number picker). Бот роздає номерки, зберігає дані, дозволяє адміну керувати та експортувати списки.

---

## Стек

- **Runtime:** Node.js 20+
- **Мова:** TypeScript (strict mode)
- **Telegram:** Grammy + @grammyjs/conversations + @grammyjs/session
- **БД:** SQLite + Prisma ORM
- **Режим:** Polling (без webhook)
- **Логування:** Pino
- **Тести:** Vitest
- **Деплой:** Hetzner VPS (існуючий сервер) + PM2

---

## Структура проєкту

```
src/
  bot/
    handlers/
      user.ts         # /start, /my_ticket, реєстрація, фото
      admin.ts        # /pending, /stats, /export, /add_donor, /new_raffle, /settings
    conversations/
      register.ts     # wizard: ім'я+прізвище → телефон → скріншот
      addDonor.ts     # адмін додає вручну
      pickTicket.ts   # вибір з 5 номерків після апруву
    middlewares/
      auth.ts         # перевірка ролей
      rateLimit.ts    # in-memory Map, без Redis
      logger.ts       # pino логування
      errorHandler.ts # глобальний catch
    keyboards.ts      # всі inline-кнопки
  db/
    schema.prisma
    client.ts
  config.ts           # zod parse process.env
  index.ts            # точка входу + graceful shutdown
```

---

## Схема БД (Prisma)

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Config {
  key   String @id
  value String
}
// Ключі:
// "activeEventId"     — UUID поточного активного Event
// "rememberUserData"  — "true" / "false" (налаштування адміна)

model Event {
  id          String      @id @default(uuid())
  title       String
  description String?
  status      EventStatus @default(ACTIVE)
  maxTickets  Int         @default(500)
  createdAt   DateTime    @default(now())
  donations   Donation[]
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
  screenshotFileId  String?        # зберігаємо до апруву/відхилення
  screenshotHash    String?        # SHA-256 для захисту від дублів
  status            DonationStatus @default(PENDING)
  chosenTicket      Int?           # присвоюється після апруву
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
  meta       String?  # JSON як рядок (SQLite не має JSON type)
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

---

## Ієрархія ролей

### Super Admin (розробник)
- Визначається через `SUPER_ADMIN_ID` в `.env` — hardcoded
- Може все: додавати/видаляти адмінів, /new_raffle, /settings

### Admin (організатор)
- Зберігається в таблиці `Admin`
- Додається через `/add_admin <telegram_id>` (по ID, не по username!)
- Видаляється через `/remove_admin <telegram_id>`
- Підтверджує/відхиляє донати, бачить статистику, робить експорт

> ⚠️ `/add_admin` приймає Telegram ID (число), не @username.
> Telegram Bot API не дозволяє резолвити username → ID.
> Telegram ID можна дізнатись через @userinfobot

---

## Флоу донатера

```
/start
  └── Крок 1: Введіть ім'я та прізвище
        └── Крок 2: Поділіться номером телефону [кнопка]
              └── Крок 3: Надішліть скріншот оплати
                    └── PENDING → адмін отримує сповіщення

Після апруву адміном:
  └── Бот пропонує 5 вільних номерків [inline кнопки]
        └── Юзер обирає
              └── "🎉 Ваш номерок: #47"

/my_ticket — переглянути свій номерок у будь-який момент
```

### Повторний розіграш (rememberUserData = true)
Якщо юзер вже брав участь раніше — бот знаходить його в таблиці User і пропонує використати збережені дані:
```
Ми вас знаємо! Марія Іваненко, +380501234567
Використати ці дані? [✅ Так] [✏️ Змінити]
```

### Повторний розіграш (rememberUserData = false)
Юзер завжди вводить ім'я і телефон заново.

---

## Флоу адміна

```
Отримує повідомлення:
  🔔 Новий запит #127
  👤 Марія Іваненко
  📞 +380501234567
  📸 [Скріншот]
  [✅ Підтвердити] [❌ Відхилити]

→ ✅ Підтвердити:
    Бот питає причину відмови... (ні, просто підтверджує)
    Бот відправляє юзеру 5 вільних номерків
    Юзер обирає → номерок закріплено
    AuditLog: APPROVED

→ ❌ Відхилити:
    Бот питає причину → адмін вводить текст
    Юзер отримує повідомлення з причиною
    AuditLog: REJECTED
```

---

## Команди адміна

```
/pending              — список донатів що чекають
/stats                — статистика поточного розіграшу
/add_donor            — додати зовнішнього учасника вручну
/add_admin <id>       — додати адміна по Telegram ID
/remove_admin <id>    — видалити адміна
/export               — меню вибору формату експорту
/new_raffle           — розпочати новий розіграш (тільки super admin)
/settings             — налаштування бота (тільки super admin)
```

---

## Експорт (три формати)

```
/export →
  [📊 CSV файл]        [📋 Список імен]    [🔢 Список номерків]
```

**CSV** — для Excel/Google Sheets:
```
number,firstName,lastName,phone
47,Марія,Іваненко,+380501234567
88,Олег,Коваль,+380671234567
```

**Список імен** — для wheelofnames.com:
```
Марія Іваненко
Олег Коваль
Ірина Мельник
```

**Список номерків** — для number picker:
```
47
88
134
```

---

## Новий розіграш (/new_raffle)

```bash
# Тільки super admin
/new_raffle "Назва розіграшу" 500
#                              ↑ кількість номерків у пулі

# Бот:
# → закриває поточний Event (status: CLOSED)
# → створює новий Event
# → оновлює Config "activeEventId"
# → повідомляє: "✅ Новий розіграш розпочато. Пул: 500 номерків."
```

Старі дані зберігаються — Event зі статусом CLOSED, всі Donation залишаються.

---

## Налаштування (/settings)

```bash
/settings                          — показати поточні налаштування
/settings remember_users on        — запам'ятовувати юзерів між розіграшами
/settings remember_users off       — завжди питати дані заново
```

Зберігається в таблиці Config як `rememberUserData = "true"/"false"`.

---

## Змінні середовища (.env)

```env
BOT_TOKEN=           # токен від BotFather
DATABASE_URL=        # file:./prisma/blago.db
SUPER_ADMIN_ID=      # твій Telegram ID (число)
NODE_ENV=development
```

### Валідація (config.ts)

```typescript
import { z } from 'zod'

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string(),
  SUPER_ADMIN_ID: z.coerce.bigint(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const config = schema.parse(process.env)
```

---

## Rate limiting (без Redis)

```typescript
// In-memory Map — скидається при рестарті, прийнятно для MVP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export const rateLimit = async (ctx: Context, next: NextFunction) => {
  const userId = ctx.from?.id.toString()
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

---

## Критичні правила коду

### Телефон — через Telegram кнопку
```typescript
// Запит номера через нативну Telegram кнопку (не можна підробити)
await ctx.reply('Поділіться вашим номером телефону:', {
  reply_markup: new Keyboard()
    .requestContact('📱 Поділитися номером')
    .resized()
})
// Отримання: ctx.message.contact.phone_number
```

### Ідемпотентність webhook (polling теж може дублювати)
```typescript
const existing = await prisma.donation.findUnique({
  where: { telegramMessageId: BigInt(ctx.message.message_id) }
})
if (existing) return
```

### Race condition при виборі номерка
```typescript
await prisma.$transaction(async (tx) => {
  const taken = await tx.donation.findFirst({
    where: {
      eventId,
      chosenTicket,
      status: { in: ['PENDING', 'APPROVED'] }
    }
  })
  if (taken) throw new Error('TICKET_TAKEN')
  await tx.donation.update({ where: { id }, data: { chosenTicket } })
})
// При TICKET_TAKEN — показати нові 5 варіантів
```

### Хешування скріншотів
```typescript
const fileBuffer = await downloadTelegramFile(file.file_id)
const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
const duplicate = await prisma.donation.findFirst({ where: { screenshotHash: hash } })
if (duplicate) {
  await ctx.reply('❌ Цей скріншот вже було використано раніше')
  return
}
// Зберігаємо screenshotFileId + screenshotHash в Donation
// screenshotFileId дозволяє адміну бачити фото через Telegram
```

### Генерація 5 вільних номерків
```typescript
const activeEventId = await getConfig('activeEventId')
const event = await prisma.event.findUnique({ where: { id: activeEventId } })

const takenTickets = await prisma.donation.findMany({
  where: {
    eventId: activeEventId,
    status: { in: ['PENDING', 'APPROVED'] },
    chosenTicket: { not: null }
  },
  select: { chosenTicket: true }
})
const takenSet = new Set(takenTickets.map(d => d.chosenTicket))

const available: number[] = []
while (available.length < 5) {
  const n = Math.floor(Math.random() * event.maxTickets) + 1
  if (!takenSet.has(n) && !available.includes(n)) available.push(n)
}
// Показуємо available як inline кнопки
```

### Audit log
```typescript
await prisma.auditLog.create({
  data: {
    donationId: donation.id,
    action: 'APPROVED',
    actor: `admin:${ctx.from.id}`,
    meta: JSON.stringify({ ticketNumber, adminUsername: ctx.from.username })
  }
})
```

### Graceful shutdown
```typescript
process.once('SIGINT', async () => {
  bot.stop()
  await prisma.$disconnect()
})
process.once('SIGTERM', async () => {
  bot.stop()
  await prisma.$disconnect()
})
```

---

## UX — Шаблони повідомлень

**Крок 1 — ім'я:**
```
👋 Вітаємо в благодійному розіграші!

📋 Крок 1 з 3 — Ваше ім'я та прізвище

Введіть ваше повне ім'я (наприклад: Марія Іваненко)

[❌ Скасувати]
```

**Крок 2 — телефон:**
```
📋 Крок 2 з 3 — Номер телефону

Натисніть кнопку нижче щоб поділитися номером

💡 Це потрібно щоб ми могли зв'язатись з переможцем

[📱 Поділитися номером] [❌ Скасувати]
```

**Крок 3 — скріншот:**
```
📋 Крок 3 з 3 — Скріншот оплати

Надішліть скріншот підтвердження переказу

💡 Зробіть скріншот з банківського додатку де
видно суму, дату і статус "Успішно"

[⬅️ Назад] [❌ Скасувати]
```

**Прийнято в очікування:**
```
✅ Дякуємо! Ваш запит отримано.

⏳ Очікуйте підтвердження адміна.
Зазвичай це займає до 2 годин.

Перевірити статус — /my_ticket
```

**Пропозиція номерків (після апруву):**
```
🎉 Ваш донат підтверджено!

🎟 Оберіть свій номерок:

[#47] [#88] [#134] [#267] [#391]

💡 Обраний номерок буде закріплено за вами назавжди
```

**Номерок обрано:**
```
🎉 Вітаємо!

🎟 Ваш номерок: #47
👤 Марія Іваненко
📞 +380501234567

Переможця буде оголошено організатором.
Зберегти дані — /my_ticket
```

**Відхилено:**
```
❌ На жаль, ваш запит не підтверджено.

Причина: [причина від адміна]

Якщо ви вважаєте це помилкою — зверніться
до організатора напряму.
```

---

## Edge cases — всі покриті

- Донатер надсилає не фото (документ, відео, текст) → м'яка відмова з підказкою
- Скріншот < 50KB → відмова як некоректний файл
- Донатер надсилає дублікат скріншота → відмова з поясненням (SHA-256 match)
- Два донатери одночасно вибирають один номерок → транзакція + нові 5 варіантів
- Адмін підтверджує вже відхилений донат → перевірка статусу перед дією
- Немає вільних номерків → повідомлення юзеру + алерт super admin
- `/my_ticket` до підтвердження → "⏳ Ваш донат на розгляді"
- `/my_ticket` після підтвердження але до вибору номерка → "🎟 Оберіть номерок" (кнопки знову)
- Зовнішній донатер доданий вручну → `external: true`, номерок одразу
- Донатер заблокував бота → catch TelegramError 403, логувати без краша
- Повторний юзер при rememberUserData=true → пропонуємо збережені дані
- Повторний юзер при rememberUserData=false → реєструємо заново

---

## MVP scope — тільки це

- Super admin (ти) + до 3 адмінів через команду
- Одна активна кампанія (Config activeEventId)
- Реєстрація: ім'я + прізвище + телефон (нативна кнопка) + скріншот
- Ручне підтвердження адміном
- Вибір з 5 вільних номерків після апруву
- `/my_ticket` для юзера
- `/stats`, `/pending`, `/export` (3 формати) для адміна
- `/add_donor` для зовнішніх учасників
- `/new_raffle` для нового розіграшу
- `/settings remember_users on/off`

---

## Деплой на Hetzner VPS

```bash
# Перший запуск (на сервері)
git clone https://github.com/... /opt/blago-bot
cd /opt/blago-bot
npm install
npx prisma migrate deploy
npm run build
pm2 start dist/index.js --name blago-bot
pm2 save
pm2 startup  # щоб піднімався після перезавантаження сервера

# Оновлення після змін
git pull
npm run build
pm2 restart blago-bot

# Бекап (SQLite = один файл)
cp prisma/blago.db backups/$(date +%Y%m%d).db
```

---

## Команди для розробки

```bash
npm run dev          # tsx watch src/index.ts
npm run build        # tsc
npm run start        # node dist/index.js
npm run test         # vitest
npm run db:push      # prisma db push (dev)
npm run db:migrate   # prisma migrate deploy (prod)
npm run db:studio    # Prisma Studio
npm run db:seed      # тестові дані (org + event + super admin)
```

---

## Що НЕ робити

- Не зберігати скріншоти на диск — тільки screenshotFileId (Telegram зберігає) + SHA-256 hash
- Не логувати токени, телефони, імена
- Не довіряти сумі від донатера — вона взагалі не збирається
- Не давати адмін-команди без перевірки ролі
- Не блокувати підозрілих автоматично — тільки позначати
- Не робити розіграш в боті — поза скопом MVP
- Не запускати без валідації `.env` через Zod
- Не використовувати `@username` для `/add_admin` — тільки Telegram ID
