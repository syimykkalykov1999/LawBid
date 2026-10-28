---
id: calendar-link
title: Подключить календари адвокатов: Google Calendar и Outlook
category: content
cost: Бесплатно (Google Cloud и Microsoft Entra бесплатны для такого объёма)
time: 40-60 минут на оба сервиса; проверка приложения Google — от нескольких дней до пары недель ожидания
runbook: CALENDAR_GOOGLE_MICROSOFT.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/CALENDAR_GOOGLE_MICROSOFT.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/CALENDAR_GOOGLE_MICROSOFT.md
  - Google: Setting up OAuth 2.0 | https://support.google.com/cloud/answer/6158849
  - Google Calendar API: overview | https://developers.google.com/workspace/calendar/api/guides/overview
  - Microsoft: Register an application with the Microsoft identity platform | https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
---

## Что это и зачем

Адвокат может связать свой Google Calendar или Outlook с LawBid. Тогда его занятое время в личном календаре закрывает слоты для записи на консультацию (мы читаем только «занято/свободно», названия встреч не видим), а подтверждённые консультации сами появляются у него в календаре и исчезают при отмене. Код готов, но выключен. Чтобы заработало, нужно один раз завести «приложение» у Google и у Microsoft, вставить два ключа в админку и включить переключатель.

Не путать с личной ссылкой-подпиской на календарь (ICS): она работает уже сейчас (`calendar.feed_enabled`) и от этих шагов не зависит.

Адреса возврата, которые понадобятся в обоих кабинетах: Google — `https://api.lawbid.dev/api/v1/calendar/oauth/google/callback`; Microsoft — `https://api.lawbid.dev/api/v1/calendar/oauth/microsoft/callback`.

## Что понадобится

- Аккаунт компании в Google и в Microsoft (бесплатный tenant Microsoft создаётся по подсказке).
- Логотип, ссылки на Privacy Policy и Terms на lawbid.dev.
- Вход в админку под владельцем, код 2FA.
- Для Google — готовность пройти проверку приложения (короткое видео, объяснение, зачем нужен календарь).

## Шаги

### Google

1. Откройте console.cloud.google.com → выбор проекта → **New project**, имя `LawBid Calendar` → **Create**.
2. **APIs & Services → Library** → найдите **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (в новом интерфейсе **Google Auth Platform**) → **Get started**: App name `LawBid`, почта поддержки, Audience **External**, контактная почта → **Create**.
4. **Branding**: логотип, ссылки на Privacy Policy и Terms, домен `lawbid.dev` в Authorized domains.
5. **Data Access → Add or remove scopes**: добавьте `.../auth/calendar.freebusy` и `.../auth/calendar.events.owned` (плюс `openid`, `email`, обычно уже есть) → **Save**.
6. **Clients** (или **Credentials → Create credentials → OAuth client ID**): тип **Web application**, имя `LawBid API`, в **Authorized redirect URIs** вставьте адрес Google выше → **Create**. Скопируйте **Client ID** и **Client secret**.
7. **Audience** → **Publish app**. Пока статус `Testing`, работают только тестовые пользователи (до 100) и доступ слетает через 7 дней. Google запросит **Verification** для «чувствительных» разрешений — это ожидание от нескольких дней до пары недель; до проверки люди видят предупреждение, но могут пройти дальше.
8. В админке **Безопасность → Ключи и сервисы** → карточка `google_calendar` → вставьте Client ID и Client secret → **Сохранить** → **Проверить** → **Включить** (код 2FA).
9. **Система → Настройки** → `calendar.google_enabled` → включить.

### Microsoft

1. Откройте entra.microsoft.com → **Entra ID → App registrations → New registration**: Name `LawBid Calendar`; Supported account types — **Accounts in any organizational directory and personal Microsoft accounts**; Redirect URI тип **Web**, адрес Microsoft выше → **Register**.
2. Скопируйте **Application (client) ID**.
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**: `Calendars.ReadWrite`, `offline_access`, `openid`, `email` → **Add permissions**. Кнопка **Grant admin consent** не обязательна.
4. **Certificates & secrets → Client secrets → New client secret**, срок 24 месяца → **Add**. Скопируйте колонку **Value** (не **Secret ID**) — потом её не показать. Поставьте напоминание обновить секрет за месяц до конца срока.
5. Желательно: **Branding & properties** — ссылки на Privacy/Terms и **Publisher verification**, иначе у людей надпись «unverified».
6. В админке **Ключи и сервисы** → карточка `microsoft_calendar` → Application (client) ID, Client secret Value, Tenant оставьте `common` → **Сохранить** → **Проверить** → **Включить**.
7. **Настройки** → `calendar.microsoft_enabled` → включить.

## Как проверить

- В **Ключи и сервисы** карточки `google_calendar` и `microsoft_calendar` зелёные, статус «Включено».
- Зайдите в приложение тестовым адвокатом и подключите календарь (экран подключения появится в приложении позже; пока подключение запускает Claude через API).
- Создайте у этого адвоката в Google/Outlook событие «занято» — через минуту этого времени не должно быть среди свободных слотов (результат кэшируется 60 секунд).
- Запишите консультацию — она появится в календаре адвоката в течение минуты.

## Частые ошибки

- «Ссылка устарела» у адвоката: он открыл её позже 10 минут. Начать заново.
- Статус подключения `needs_reauth`: человек отозвал доступ или истёк секрет Microsoft. Подключить заново или обновить секрет.
- Google/Outlook не отвечает: запись к адвокату работает как раньше, просто без учёта внешнего календаря (ожидание не дольше `calendar.busy_timeout_ms`).
- Скопировали **Secret ID** вместо **Value** у Microsoft — проверка в админке не пройдёт. Создайте новый секрет.
- Аварийно выключить всё: `calendar.google_enabled` и `calendar.microsoft_enabled` в **Настройках** — обращений к Google/Microsoft больше не будет.
