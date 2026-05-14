# Bot UX: Menus, Registration Flow, Instructions, Group Link

**Date:** 2026-05-14
**Status:** Approved

---

## Overview

Upgrade the bot UX from slash-command-only to persistent Reply Keyboards with separate layouts for users and admins. Fix registration flow with back navigation and cancel confirmation. Add help/instructions message. Send group link after ticket claim.

---

## 1. Persistent Reply Keyboards

### User keyboard
```
[🎟 Взяти участь]  [📋 Мій номерок]
[ℹ️ Допомога]
```

### Admin keyboard
```
[⏳ Очікують]  [📊 Статистика]
[👤 Додати донора]  [📤 Експорт]
[⚙️ Налаштування]
```

### Role detection
On `/start`, check `SUPER_ADMIN_ID` or presence in `Admin` table → send the appropriate keyboard immediately. Keyboard persists in Telegram UI — no re-sending needed on subsequent sessions unless keyboard was removed.

### Button handling
`bot.hears()` intercepts button text (e.g. `"⏳ Очікують"`) and routes to the same handler as the original slash command. Slash commands remain functional as aliases.

### Sending the keyboard
After registration (success or cancel) and on `/start`, call a shared `sendMainMenu(ctx)` helper that detects role and sends the correct `Reply Keyboard` + welcome/status message.

---

## 2. Registration Flow

### Step structure

**Step 1 — Name** (inline cancel only, no back):
```
📋 Крок 1 з 3 — Ваше ім'я та прізвище
Введіть повне ім'я (наприклад: Марія Іваненко)

[❌ Скасувати]
```

**Step 2 — Phone** (Reply Keyboard replaces persistent menu temporarily):
```
📋 Крок 2 з 3 — Номер телефону
Натисніть кнопку щоб поділитися номером

[📱 Поділитися номером]   ← requestContact
[⬅️ Назад]  [❌ Скасувати]
```

**Step 3 — Screenshot** (inline back + cancel):
```
📋 Крок 3 з 3 — Скріншот оплати
Надішліть скріншот з банківського додатку де видно суму, дату і статус "Успішно"

[⬅️ Назад]  [❌ Скасувати]
```

### Back navigation
`collectUserData()` becomes a state machine with `step: 1 | 2`:
- Step 2 → "⬅️ Назад" → re-runs Step 1
- Step 3 → "⬅️ Назад" (inline) → re-runs Step 2

### Cancel confirmation
Any "❌ Скасувати" press shows:
```
Скасувати реєстрацію?
[✅ Так, скасувати]  [▶️ Продовжити]
```
- Confirm → restore persistent keyboard + main menu message
- Continue → return to current step

### After registration
On success or cancel, call `sendMainMenu(ctx)` to restore the persistent keyboard.

### Error handling
- Non-text on name step → "Введіть ім'я та прізвище текстом."
- Only first name (no space) → "Введіть ім'я та прізвище через пробіл"
- Text instead of contact on phone step → "Натисніть кнопку 📱 нижче"
- Document instead of photo → "Надішліть саме фото, а не файл"
- Photo < 10KB → "Скріншот виглядає некоректно"
- Duplicate screenshot hash → "Цей скріншот вже було використано"
- `/start` mid-registration → cancel current conversation, restart

---

## 3. Help / Instructions

Triggered by: `"ℹ️ Допомога"` button or `/help` command.

```
ℹ️ Благодійний розіграш

Учасники роблять донат організатору,
надсилають скріншот підтвердження і
отримують номерок. Переможця обирає
організатор вручну (wheelofnames.com).

📋 Як взяти участь:
1. Зроби переказ організатору
2. Натисни "🎟 Взяти участь"
3. Вкажи ім'я та прізвище
4. Поділися номером телефону
5. Надішли скріншот з банківського додатку
6. Очікуй підтвердження (до 2 годин)
7. Обери номерок із запропонованих

❓ Часті питання:
• Скріншот не приймається — переконайся що видно суму, дату та статус "Успішно"
• Вже брав участь раніше — твої дані збережені, реєстрація швидша
• Отримав відмову — зверніться до організатора

📞 Організатор: @KravetsNaastia
```

---

## 4. Group Link After Ticket Claim

After `claimTicket()` succeeds in `user.ts`, send a second message immediately:

```
👥 Приєднуйся до групи учасників розіграшу:
https://t.me/+fXPZISsE5bQ4ZWVi
```

Hardcoded constant `GROUP_LINK = "https://t.me/+fXPZISsE5bQ4ZWVi"` in `config.ts` or a constants file.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src/bot/keyboards.ts` | Add `userMenuKeyboard`, `adminMenuKeyboard`, `phoneWithBackKeyboard`, `cancelWithBackKeyboard`, `confirmCancelKeyboard` |
| `src/bot/handlers/user.ts` | Add `sendMainMenu()` helper, add `hears()` for button texts, add `/help`, send group link after claim |
| `src/bot/handlers/admin.ts` | Add `hears()` for all admin button texts |
| `src/bot/conversations/register.ts` | Refactor `collectUserData()` to state machine with back, add cancel confirmation |
| `src/config.ts` | Add `GROUP_LINK` constant |

---

## 6. Out of Scope

- `/new_raffle` and `/settings` remain super-admin slash commands only (no keyboard button)
- No changes to DB schema
- No changes to admin approval/rejection flow
- No `@grammyjs/menu` plugin
