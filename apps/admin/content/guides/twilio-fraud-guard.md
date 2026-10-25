---
id: twilio-fraud-guard
title: Twilio - защита от накрутки SMS
category: security
cost: Бесплатно в США и Канаде. Для Verify защита Fraud Guard включена без доплаты.
time: 10 минут
verified: 2026-10-25
sources:
  - Twilio - SMS Pumping Protection для Programmable Messaging | https://www.twilio.com/docs/messaging/features/sms-pumping-protection-programmable-messaging
  - Twilio - Verify Fraud Guard | https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard
  - Twilio - обзор защиты от SMS pumping | https://www.twilio.com/en-us/blog/developers/best-practices/sms-pumping-protection-options
---

## Что это и зачем

SMS pumping: боты просят коды на дорогие номера, а вы платите за каждое SMS. У Twilio есть встроенная защита, которая блокирует подозрительные номера. Наш сервер шлёт SMS с номера или через Messaging Service (Programmable Messaging), поэтому нужна **SMS Pumping Protection**.

## Что понадобится

- Платный аккаунт Twilio и роль Admin.
- Ограничение стран уже сделано (см. инструкцию «Twilio - SMS и звонки только в США»).

## Шаги

1. Откройте [Twilio Console](https://console.twilio.com/) → **Messaging** → **Settings**.
2. Найдите блок **SMS Pumping Protection** и выберите **Enabled**. Защита работает сразу.
3. Если когда-нибудь перейдёте на **Verify**: **Verify** → **Services** → ваш сервис → **Service settings** → вкладка **SMS** → включите **Enable Fraud Guard**. Уровень в поле **Protection Level**: **Basic**, **Standard** (по умолчанию) или **Max**. Для трафика только по США хватает **Standard**.
4. Что заблокировано, смотрите так. Programmable Messaging: журнал ошибок Twilio, ошибка 30450, и панель **SMS Pumping Protection Insights**. Verify: **Monitor** → **Logs** → **Verify** → вкладка **Blocked Verifications** (ошибка 60410).
5. Если заблокирован настоящий человек, его номер добавляют в безопасный список через Global Safe List API (это делает разработчик).

## Куда вставить в нашей админке

Ничего. Вторая линия защиты уже в нашем коде: проверка приложения Firebase App Check (см. инструкцию «Firebase App Check - защита от ботов») и лимиты SMS в **Система** → **Настройки** (`sms.*`).

## Как проверить

1. В **Messaging** → **Settings** у SMS Pumping Protection стоит **Enabled**.
2. Через несколько дней загляните в **SMS Pumping Protection Insights**: там видно число заблокированных сообщений.
3. Своего огонька в «Запуске» нет. Рядом работает пункт «App Check (защита от ботов в приложении)».

## Частые ошибки

- Включили Fraud Guard у Verify, а шлёте с номера: защита не применяется. Нужна SMS Pumping Protection.
- Стопроцентной защиты нет, возможны ложные срабатывания. Поэтому держите страны ограниченными и ставьте разумный потолок расходов.
- Fraud Guard защищает только SMS, не голос.
- (не удалось проверить: не поменялся ли путь меню - документация указывает Messaging → Settings)
