# Charity Raffle Bot 🎟

Telegram-бот для благодійних розіграшів. Юзери реєструються (ім'я, телефон, скріншот оплати), адміни підтверджують, юзери обирають номерки. Розіграш проводить організатор вручну (wheelofnames.com або number picker).

---

## Що потрібно для запуску

### 1. Сервер / локальна машина

- **Node.js 20+** — `node --version`
- **npm 10+** — йде разом з Node

### 2. Telegram Bot Token

1. Відкрий [@BotFather](https://t.me/BotFather) в Telegram
2. `/newbot` → придумай назву та username
3. BotFather дасть токен вигляду `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3. Свій Telegram ID (Super Admin)

Відкрий [@userinfobot](https://t.me/userinfobot) → надішли `/start` → отримаєш число, наприклад `265164524`

> ⚠️ **Типова помилка:** `SUPER_ADMIN_ID` — це **не** токен бота і не його перша частина.
> Токен має вигляд `8672350762:AAE...` — не ставте `8672350762` як ID!
> Це різні речі. ID отримується тільки через [@userinfobot](https://t.me/userinfobot).

---

## Додавання адмінів

Після запуску ти як super admin можеш додати інших людей для моніторингу та апруву заявок.

### Як дізнатись Telegram ID іншої людини

Попроси людину відкрити [@userinfobot](https://t.me/userinfobot) і надіслати `/start` — бот покаже її числовий ID.

### Додати адміна

```
/add_admin 987654321
```

Адмін одразу зможе:

- Отримувати сповіщення про нові заявки з кнопками ✅/❌
- Підтверджувати та відхиляти скріншоти
- Переглядати `/stats`, `/pending`
- Робити `/export` списків
- Додавати зовнішніх учасників через `/add_donor`

### Видалити адміна

```
/remove_admin 987654321
```

### Права доступу

| Дія                             | Юзер | Admin | Super Admin |
| ------------------------------- | :--: | :---: | :---------: |
| Реєстрація `/start`             |  ✅  |  ✅   |     ✅      |
| `/my_ticket`                    |  ✅  |  ✅   |     ✅      |
| Апруват/відхилення заявок       |  —   |  ✅   |     ✅      |
| `/stats`, `/pending`, `/export` |  —   |  ✅   |     ✅      |
| `/add_donor`                    |  —   |  ✅   |     ✅      |
| `/add_admin`, `/remove_admin`   |  —   |   —   |     ✅      |
| `/new_raffle`                   |  —   |   —   |     ✅      |
| `/settings`                     |  —   |   —   |     ✅      |

---

## Локальний запуск (розробка)

```bash
# 1. Клонуй репозиторій
git clone <repo-url>
cd blago-bot

# 2. Встанови залежності
npm install

# 3. Скопіюй .env і заповни
cp .env.example .env
```

Відкрий `.env` і заповни:

```env
BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=file:./prisma/blago.db
SUPER_ADMIN_ID=123456789
NODE_ENV=development
```

```bash
# 4. Створи базу даних і застосуй схему
npm run db:push

# 5. Заповни базу початковими даними (перший розіграш + налаштування)
npm run db:seed

# 6. Запусти в режимі розробки (hot reload)
npm run dev
```

Бот запуститься в polling-режимі. Надішли `/start` собі в Telegram — має відповісти.

---

## Деплой на Hetzner VPS (production)

### Першочерговий деплой

```bash
# SSH на сервер
ssh root@<server-ip>

# Клонуй репозиторій
git clone <repo-url> /opt/blago-bot
cd /opt/blago-bot

# Встанови залежності
npm install

# Скопіюй та заповни .env
cp .env.example .env
nano .env
# → вкажи BOT_TOKEN, SUPER_ADMIN_ID, NODE_ENV=production

# Створи базу і накати схему
npm run db:push

# Заповни початковими даними
npm run db:seed

# Збери TypeScript → JavaScript
npm run build

# Запусти через PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # скопіюй і виконай команду яку видасть
```

### Оновлення після змін у коді

```bash
cd /opt/blago-bot
git pull
npm install
npm run build
pm2 restart blago-bot
```

### Перевірка статусу

```bash
pm2 status blago-bot          # має бути "online"
pm2 logs blago-bot --lines 30 # логи в реальному часі
```

### Бекап бази (SQLite = один файл)

```bash
cp /opt/blago-bot/prisma/blago.db /opt/blago-bot/backups/$(date +%Y%m%d_%H%M).db
```

---

## Команди бота

### Для юзерів

| Команда      | Що робить                                        |
| ------------ | ------------------------------------------------ |
| `/start`     | Розпочати реєстрацію (ім'я → телефон → скріншот) |
| `/my_ticket` | Переглянути свій номерок або статус заявки       |

### Для адмінів

| Команда                           | Що робить                             | Роль        |
| --------------------------------- | ------------------------------------- | ----------- |
| `/stats`                          | Статистика поточного розіграшу        | Admin       |
| `/pending`                        | Список заявок що очікують             | Admin       |
| `/export`                         | Меню експорту (CSV / імена / номерки) | Admin       |
| `/add_donor`                      | Додати учасника вручну                | Admin       |
| `/add_admin <telegram_id>`        | Додати адміна за Telegram ID          | Super Admin |
| `/remove_admin <telegram_id>`     | Видалити адміна                       | Super Admin |
| `/new_raffle "Назва" <кількість>` | Запустити новий розіграш              | Super Admin |
| `/settings`                       | Переглянути/змінити налаштування      | Super Admin |

> ⚠️ `/add_admin` приймає **Telegram ID** (число), не @username.
> Дізнатись ID через [@userinfobot](https://t.me/userinfobot).

### Приклади

```
/new_raffle "Розіграш травень 2026" 500
/add_admin 987654321
/remove_admin 987654321
/settings remember_users on
/settings remember_users off
```

---

## Як це працює — флоу

### Юзер реєструється

```
/start → кнопка "Зареєструватись"
  → Крок 1: Ім'я та прізвище (текстом)
  → Крок 2: Номер телефону (кнопка — нативний Telegram контакт)
  → Крок 3: Скріншот оплати (фото, мін 50KB)
  → Очікує підтвердження адміна
```

### Адмін підтверджує

```
Адмін отримує фото скріншоту з кнопками [✅ Підтвердити] [❌ Відхилити]
  ✅ → Юзер отримує 5 випадкових вільних номерків для вибору
  ❌ → Адмін вводить причину → Юзер отримує повідомлення з причиною
```

### Юзер обирає номерок

```
[#47] [#88] [#134] [#267] [#391]
  → Обирає один → Номерок закріплено
  → При колізії (хтось встиг вперше) → нові 5 варіантів автоматично
```

### Повторний розіграш

- `rememberUserData = true` → бот пам'ятає ім'я/телефон, пропонує використати
- `rememberUserData = false` → завжди вводить заново

---

## Структура проєкту

```
blago-bot/
├── src/
│   ├── index.ts                    # Точка входу, middleware chain, polling
│   ├── config.ts                   # Zod валідація .env
│   ├── types.ts                    # MyContext, SessionData
│   ├── db/
│   │   ├── client.ts               # Prisma singleton
│   │   ├── configStore.ts          # getConfig / setConfig
│   │   └── tickets.ts              # generateAvailableTickets, claimTicket
│   └── bot/
│       ├── keyboards.ts            # Всі inline/reply клавіатури
│       ├── handlers/
│       │   ├── user.ts             # /start, /my_ticket, ticket callback
│       │   └── admin.ts            # Всі адмін-команди і approve/reject
│       ├── conversations/
│       │   ├── register.ts         # Wizard реєстрації юзера
│       │   ├── rejectDonation.ts   # Wizard відхилення з причиною
│       │   └── addDonor.ts         # Ручне додавання учасника
│       └── middlewares/
│           ├── auth.ts             # Перевірка ролей
│           ├── rateLimit.ts        # 3 запити / 10 хв per user
│           ├── logger.ts           # Pino логування
│           └── errorHandler.ts     # Глобальний catch
├── prisma/
│   ├── schema.prisma               # Схема БД
│   └── seed.ts                     # Початкові дані
├── tests/                          # Vitest тести
├── ecosystem.config.js             # PM2 конфіг
└── .env.example                    # Шаблон змінних середовища
```

---

## Змінні середовища

| Змінна           | Обов'язкова | Опис                                          |
| ---------------- | ----------- | --------------------------------------------- |
| `BOT_TOKEN`      | ✅          | Токен від BotFather                           |
| `DATABASE_URL`   | ✅          | Шлях до SQLite файлу (залиш за замовчуванням) |
| `SUPER_ADMIN_ID` | ✅          | Твій Telegram ID (число)                      |
| `NODE_ENV`       | —           | `development` або `production`                |

---

## npm скрипти

```bash
npm run dev          # Запуск з hot reload (tsx watch)
npm run build        # TypeScript → JavaScript (dist/)
npm run start        # Запуск зібраного dist/index.js
npm test             # Vitest — всі тести
npm run test:watch   # Vitest у watch-режимі
npm run db:push      # Застосувати схему до БД (dev)
npm run db:migrate   # Накатити міграції (prod)
npm run db:studio    # Prisma Studio — GUI для БД
npm run db:seed      # Заповнити початковими даними
```

---

## Адміністрування бази

```bash
# Переглянути дані у браузері
npm run db:studio
# → відкриє http://localhost:5555

# Зробити бекап
cp prisma/blago.db prisma/blago.db.backup

# Переглянути активний розіграш
sqlite3 prisma/blago.db "SELECT * FROM Config;"

# Список всіх учасників з номерками
sqlite3 prisma/blago.db \
  "SELECT u.firstName, u.lastName, u.phone, d.chosenTicket
   FROM Donation d JOIN User u ON d.userId = u.id
   WHERE d.status = 'APPROVED' AND d.chosenTicket IS NOT NULL
   ORDER BY d.chosenTicket;"
```

---

## Технічний стек

- **Runtime:** Node.js 20
- **Мова:** TypeScript 5 (strict mode)
- **Telegram:** [Grammy](https://grammy.dev/) + `@grammyjs/conversations` + `@grammyjs/session`
- **БД:** SQLite + [Prisma ORM](https://www.prisma.io/)
- **Режим:** Polling (без webhook — простіше для VPS)
- **Логування:** [Pino](https://getpino.io/)
- **Тести:** [Vitest](https://vitest.dev/)
- **Деплой:** PM2 на Hetzner VPS
